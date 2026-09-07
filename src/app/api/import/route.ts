import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  generateUniqueCode,
  randomToken,
  randomRecoveryCode,
  isValidPin,
  normalizePin,
  normalizeCode,
  PHASES,
} from '@/lib/tbl'
import { hashPin } from '@/lib/pin'

// ============================================================
// POST /api/import — v2.7.0 « Téléverser une séance »
// Restaure COMPLETEMENT une sauvegarde téléchargée (fichier JSON
// produit par l'action « export_backup ») sur n'importe quel
// appareil / n'importe quelle base :
//   - une NOUVELLE séance est créée (jamais de modification d'une
//     séance existante → aucun conflit, aucun écrasement) ;
//   - tous les identifiants sont régénérés et remappés (équipes,
//     étudiants, questions, cas, items du questionnaire) ;
//   - le code de la séance est réutilisé s'il est libre, sinon un
//     nouveau code est généré (aucune collision) ;
//   - les étudiants reçoivent de NOUVEAUX jetons : ils retrouvent
//     leur compte par nom + code personnel (préservé dans la
//     sauvegarde) — exactement comme en changeant d'appareil ;
//   - le PIN enseignant est choisi à l'importation (haché bcrypt) ;
//   - les lignes invalides d'un fichier altéré sont IGNORÉES
//     (comptées dans « ignored »), jamais d'échec global ;
//   - tout est écrit en une transaction : en cas de problème, la
//     base reste dans son état antérieur.
//
// Ce mécanisme réalise la « synchronisation à la fin de la séance »
// demandée pour le mode hors ligne : la séance capturée sans
// internet (réseau local + base locale) est exportée en JSON puis
// importée ici, sur l'appareil connecté.
// ============================================================

// Garde-fous de volume (au-delà : fichier refusé, pas de boucle infinie)
const CAPS = {
  teams: 30,
  students: 500,
  questions: 300,
  cases: 50,
  answers: 60000,
  appeals: 500,
  appAnswers: 5000,
  peerEvals: 20000,
  saiItems: 100,
  saiResponses: 50000,
  alerts: 5000,
} as const

// ---------- Petits validateurs (fichier NON fiable : tout contrôler) ----------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > 0 && s.length <= max ? s : null
}

/** Texte facultatif : null si absent/invalide, sinon la chaîne bornée. */
function optStr(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length === 0 ? null : s.slice(0, max)
}

function int(v: unknown, min: number, max: number): number | null {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

function bool(v: unknown): boolean {
  return v === true
}

function date(v: unknown): Date {
  if (typeof v === 'string') {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!isObj(body)) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 })
    }
    const pin = isValidPin(body.pin) ? normalizePin(body.pin) : ''
    if (!pin) {
      return NextResponse.json(
        {
          error:
            'Choisissez un code PIN enseignant : 6 caractères ou plus, lettres et chiffres.',
        },
        { status: 400 }
      )
    }
    const backup = body.backup
    if (!isObj(backup)) {
      return NextResponse.json(
        { error: 'Fichier de sauvegarde invalide (structure non reconnue).' },
        { status: 400 }
      )
    }
    if (backup.format !== 'tbl-live-sauvegarde') {
      return NextResponse.json(
        {
          error:
            'Ce fichier n’est pas une sauvegarde de séance TBL Live (format non reconnu).',
        },
        { status: 400 }
      )
    }
    if (backup.version !== 1 && backup.version !== 2) {
      return NextResponse.json(
        { error: 'Version de sauvegarde non prise en charge.' },
        { status: 400 }
      )
    }
    const meta = isObj(backup.session) ? backup.session : null
    if (!meta) {
      return NextResponse.json(
        { error: 'Fichier de sauvegarde invalide (séance absente).' },
        { status: 400 }
      )
    }

    // ---------- Lecture (bornée) des collections ----------
    const teams = arr(backup.teams)
    const students = arr(backup.students)
    const questions = arr(backup.questions)
    const cases = arr(backup.cases)
    const answers = arr(backup.answers)
    const appeals = arr(backup.appeals)
    const appAnswers = arr(backup.appAnswers)
    const peerEvals = arr(backup.peerEvals)
    const saiItems = arr(backup.saiItems)
    const saiResponses = arr(backup.saiResponses)
    const alerts = backup.version >= 2 ? arr(backup.alerts) : []
    for (const [key, list] of Object.entries({
      teams,
      students,
      questions,
      cases,
      answers,
      appeals,
      appAnswers,
      peerEvals,
      saiItems,
      saiResponses,
      alerts,
    })) {
      const cap = CAPS[key as keyof typeof CAPS]
      if (list.length > cap) {
        return NextResponse.json(
          {
            error: `Fichier trop volumineux (${key} : ${list.length}, maximum ${cap}).`,
          },
          { status: 413 }
        )
      }
    }

    // ---------- Paramètres de la séance restaurée ----------
    const title = str(meta.title, 80)
    if (!title || title.length < 2) {
      return NextResponse.json(
        { error: 'Fichier de sauvegarde invalide (titre illisible).' },
        { status: 400 }
      )
    }
    const status = PHASES.includes(meta.status as (typeof PHASES)[number])
      ? (meta.status as string)
      : 'lobby'
    const iratMinutes = int(meta.iratMinutes, 1, 90) ?? 10
    const wantedCode = typeof meta.code === 'string' ? normalizeCode(meta.code) : ''
    const createdAt = date(meta.createdAt)

    // Le code d'origine est réutilisé s'il est libre, sinon un nouveau
    // code est généré — jamais de collision avec une séance existante.
    let code = ''
    if (wantedCode.length >= 4) {
      const clash = await db.session.findUnique({ where: { code: wantedCode } })
      if (!clash) code = wantedCode
    }
    if (!code) code = await generateUniqueCode()
    const teacherToken = randomToken()
    const teacherPinHash = await hashPin(pin)

    let ignored = 0

    const result = await db.$transaction(
      async (tx) => {
        const session = await tx.session.create({
          data: {
            code,
            title,
            teacherPin: teacherPinHash,
            teacherToken,
            status,
            iratMinutes,
            phaseStartedAt: new Date(),
            revealed: bool(meta.revealed),
            createdAt,
          },
        })

        // ---------- Équipes ----------
        const teamMap = new Map<string, string>()
        for (const row of teams) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const number = int(row.number, 1, 99) ?? teamMap.size + 1
          const name = str(row.name, 80) ?? `Équipe ${number}`
          const created = await tx.team.create({
            data: {
              sessionId: session.id,
              name,
              number,
              appealsDone: bool(row.appealsDone),
            },
          })
          if (typeof row.id === 'string' && row.id) teamMap.set(row.id, created.id)
        }

        // ---------- Cas cliniques ----------
        const caseMap = new Map<string, string>()
        for (const row of cases) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const order = int(row.order, 0, 999) ?? caseMap.size
          const cTitle = str(row.title, 200) ?? `Cas ${order + 1}`
          const created = await tx.case.create({
            data: {
              sessionId: session.id,
              title: cTitle,
              intro: optStr(row.intro, 5000),
              order,
            },
          })
          if (typeof row.id === 'string' && row.id) caseMap.set(row.id, created.id)
        }

        // ---------- Étudiants ----------
        // Jetons régénérés (les secrets ne voyagent pas dans la sauvegarde) :
        // ils se reconnectent par nom + code personnel, comme sur un
        // nouvel appareil. Le code personnel est conservé, ainsi que
        // l'état du questionnaire (saiCompletedAt / saiComment).
        const studentMap = new Map<string, string>()
        for (const row of students) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const name = str(row.name, 40)
          if (!name || name.length < 2) {
            ignored++
            continue
          }
          const recovery =
            typeof row.recoveryCode === 'string' &&
            /^[A-Z0-9]{4,12}$/.test(row.recoveryCode)
              ? row.recoveryCode
              : row.recoveryCode === ''
                ? ''
                : randomRecoveryCode()
          const teamId =
            typeof row.teamId === 'string' && teamMap.has(row.teamId)
              ? teamMap.get(row.teamId)!
              : null
          const created = await tx.student.create({
            data: {
              sessionId: session.id,
              teamId,
              name,
              token: randomToken(),
              recoveryCode: recovery,
              saiCompletedAt: row.saiCompletedAt ? date(row.saiCompletedAt) : null,
              saiComment: optStr(row.saiComment, 2000),
              createdAt: date(row.createdAt),
            },
          })
          if (typeof row.id === 'string' && row.id) studentMap.set(row.id, created.id)
        }

        // ---------- Questions (libres + QCU de cas) ----------
        const questionMap = new Map<string, string>()
        let qOrder = 0
        for (const row of questions) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const text = str(row.text, 1000)
          if (!text) {
            ignored++
            continue
          }
          // choices est un tableau JSON « ["A", "B", …] » dans la base :
          // on le revalide entièrement (2 à 6 choix, chacun borné).
          let choices: string[] = []
          try {
            const parsed = JSON.parse(typeof row.choices === 'string' ? row.choices : '[]')
            if (Array.isArray(parsed)) {
              choices = parsed
                .map((c) => (typeof c === 'string' ? c.trim() : ''))
                .filter((c) => c.length > 0)
                .slice(0, 6)
            }
          } catch {
            choices = []
          }
          if (choices.length < 2) {
            ignored++
            continue
          }
          const correct = int(row.correct, 0, choices.length - 1) ?? 0
          const phase = row.phase === 'application' ? 'application' : 'rat'
          const caseId =
            typeof row.caseId === 'string' && caseMap.has(row.caseId)
              ? caseMap.get(row.caseId)!
              : null
          const created = await tx.question.create({
            data: {
              sessionId: session.id,
              text,
              choices: JSON.stringify(choices),
              correct,
              phase,
              order: int(row.order, 0, 999) ?? qOrder,
              caseId,
            },
          })
          qOrder++
          if (typeof row.id === 'string' && row.id) questionMap.set(row.id, created.id)
        }

        // ---------- Réponses iRAT / tRAT ----------
        // Les contraintes d'unicité (une réponse iRAT par étudiant et
        // question, une tentative par équipe/question/numéro) rendent
        // l'importation idempotente : un doublon dans le fichier est
        // ignoré silencieusement (P2002) — jamais d'échec global.
        for (const row of answers) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const kind = row.kind === 'trat' ? 'trat' : 'irat'
          const questionId =
            typeof row.questionId === 'string' ? questionMap.get(row.questionId) : undefined
          const studentId =
            kind === 'irat' && typeof row.studentId === 'string'
              ? studentMap.get(row.studentId)
              : undefined
          const teamId =
            kind === 'trat' && typeof row.teamId === 'string' ? teamMap.get(row.teamId) : undefined
          if (!questionId || (kind === 'irat' && !studentId) || (kind === 'trat' && !teamId)) {
            ignored++
            continue
          }
          const choice = int(row.choice, 0, 5)
          if (choice === null) {
            ignored++
            continue
          }
          try {
            await tx.answer.create({
              data: {
                questionId,
                studentId: kind === 'irat' ? studentId! : null,
                teamId: kind === 'trat' ? teamId! : null,
                kind,
                choice,
                attempt: int(row.attempt, 1, 4) ?? 1,
                isCorrect: bool(row.isCorrect),
                score: int(row.score, 0, 4) ?? 0,
                createdAt: date(row.createdAt),
              },
            })
          } catch (e) {
            // Doublon (contrainte unique) : ligne ignorée sans échec.
            if ((e as { code?: string }).code !== 'P2002') throw e
            ignored++
          }
        }

        // ---------- Réclamations ----------
        for (const row of appeals) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const teamId =
            typeof row.teamId === 'string' ? teamMap.get(row.teamId) : undefined
          const questionId =
            typeof row.questionId === 'string' ? questionMap.get(row.questionId) : undefined
          const text = str(row.text, 2000)
          if (!teamId || !questionId || !text) {
            ignored++
            continue
          }
          await tx.appeal.create({
            data: {
              sessionId: session.id,
              teamId,
              questionId,
              text,
              status:
                row.status === 'accepted' || row.status === 'rejected'
                  ? row.status
                  : 'pending',
              createdAt: date(row.createdAt),
            },
          })
        }

        // ---------- Réponses d'application ----------
        for (const row of appAnswers) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const teamId =
            typeof row.teamId === 'string' ? teamMap.get(row.teamId) : undefined
          const questionId =
            typeof row.questionId === 'string' ? questionMap.get(row.questionId) : undefined
          const choice = int(row.choice, 0, 5)
          if (!teamId || !questionId || choice === null) {
            ignored++
            continue
          }
          try {
            await tx.appAnswer.create({
              data: {
                teamId,
                questionId,
                choice,
                text: optStr(row.text, 2000),
                createdAt: date(row.createdAt),
                updatedAt: date(row.updatedAt),
              },
            })
          } catch (e) {
            if ((e as { code?: string }).code !== 'P2002') throw e
            ignored++
          }
        }

        // ---------- Évaluations par les pairs ----------
        for (const row of peerEvals) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const evaluatorId =
            typeof row.evaluatorId === 'string'
              ? studentMap.get(row.evaluatorId)
              : undefined
          const evaluatedId =
            typeof row.evaluatedId === 'string'
              ? studentMap.get(row.evaluatedId)
              : undefined
          const score = int(row.score, 1, 5)
          if (!evaluatorId || !evaluatedId || score === null) {
            ignored++
            continue
          }
          try {
            await tx.peerEval.create({
              data: {
                sessionId: session.id,
                evaluatorId,
                evaluatedId,
                score,
                comment: optStr(row.comment, 500),
                createdAt: date(row.createdAt),
                updatedAt: date(row.updatedAt),
              },
            })
          } catch (e) {
            if ((e as { code?: string }).code !== 'P2002') throw e
            ignored++
          }
        }

        // ---------- Questionnaire TBL-SAI : items ----------
        const saiMap = new Map<string, string>()
        for (const row of saiItems) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const subscale =
            row.subscale === 'accountability' ||
            row.subscale === 'preference' ||
            row.subscale === 'satisfaction'
              ? row.subscale
              : null
          if (!subscale) {
            ignored++
            continue
          }
          const created = await tx.saiItem.create({
            data: {
              sessionId: session.id,
              subscale,
              textKey: optStr(row.textKey, 500),
              text: optStr(row.text, 1000),
              reversed: bool(row.reversed),
              order: int(row.order, 0, 999) ?? saiMap.size,
            },
          })
          if (typeof row.id === 'string' && row.id) saiMap.set(row.id, created.id)
        }

        // ---------- Questionnaire TBL-SAI : réponses ----------
        for (const row of saiResponses) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const studentId =
            typeof row.studentId === 'string' ? studentMap.get(row.studentId) : undefined
          const itemId = typeof row.itemId === 'string' ? saiMap.get(row.itemId) : undefined
          const value = int(row.value, 1, 5)
          if (!studentId || !itemId || value === null) {
            ignored++
            continue
          }
          try {
            await tx.saiResponse.create({
              data: { studentId, itemId, value },
            })
          } catch (e) {
            if ((e as { code?: string }).code !== 'P2002') throw e
            ignored++
          }
        }

        // ---------- Signalements anti-capture (sauvegardes v2) ----------
        for (const row of alerts) {
          if (!isObj(row)) {
            ignored++
            continue
          }
          const studentId =
            typeof row.studentId === 'string' ? studentMap.get(row.studentId) : undefined
          const kind = row.kind === 'screenshot' ? 'screenshot' : 'tab_hidden'
          if (!studentId) {
            ignored++
            continue
          }
          await tx.alertEvent.create({
            data: {
              studentId,
              kind,
              phase: optStr(row.phase, 20),
              createdAt: date(row.createdAt),
            },
          })
        }

        return {
          ok: true,
          code: session.code,
          teacherToken,
          title: session.title,
          pin,
          restored: {
            teams: teamMap.size,
            students: studentMap.size,
            questions: questionMap.size,
            cases: caseMap.size,
            saiItems: saiMap.size,
          },
          ignored,
        }
      },
      // Import volumineux : boucle de créations séquentielles → marge
      // confortable (défaut Prisma : 5 s, beaucoup trop juste ici).
      { timeout: 120000, maxWait: 10000 }
    )

    return NextResponse.json(result)
  } catch (e) {
    console.error('POST /api/import', e)
    return NextResponse.json(
      {
        error:
          'Importation impossible : le fichier n’a pas pu être appliqué (la base reste inchangée).',
      },
      { status: 500 }
    )
  }
}
