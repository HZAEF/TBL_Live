// ============================================================
// TBL Live — Calcul de la note finale sur 20
// Répartition par DÉFAUT : iRAT 25 % · tRAT 25 % · Application
// 35 % · Pairs 15 %. Depuis la v3.5.0, l'enseignant peut adapter
// cette pondération séance par séance depuis l'onglet
// Configurations (la somme des quatre doit faire 100 %).
// Si une composante est indisponible (aucune question de ce type,
// étudiant sans équipe, aucune évaluation reçue…), son poids est
// redistribué proportionnellement sur les autres composantes.
// ============================================================

import type { DashboardDTO, StudentStateDTO } from './tbl-types'

/** Pondération par défaut (pourcentages) — répartition historique. */
export const DEFAULT_GRADE_WEIGHTS: GradeWeights = {
  irat: 25,
  trat: 25,
  application: 35,
  peer: 15,
}

/** Pondération de la note finale en pourcentages (somme = 100). */
export interface GradeWeights {
  irat: number
  trat: number
  application: number
  peer: number
}

/** La pondération est-elle VALIDE telle quelle (chacun 0–100, somme 100) ? */
export function isValidGradeWeights(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const o = raw as Record<string, unknown>
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null
  const irat = num(o.irat)
  const trat = num(o.trat)
  const application = num(o.application)
  const peer = num(o.peer)
  if (irat === null || trat === null || application === null || peer === null) return false
  return Math.abs(irat + trat + application + peer - 100) <= 0.01
}

/**
 * Valide/nettoie une pondération reçue (création de séance, action
 * set_weights, sauvegarde restaurée, fusion de synchronisation) :
 * chaque poids est un nombre fini 0–100 et la somme fait exactement
 * 100. En cas d'écart, la répartition HISTORIQUE 25/25/35/15 est
 * renvoyée (jamais d'erreur : les entrées invalides retombent sur
 * le défaut, y compris les sauvegardes antérieures à la v3.5.0 qui
 * ne transportent pas de pondération).
 */
export function sanitizeGradeWeights(raw: unknown): GradeWeights {
  return isValidGradeWeights(raw) ? { ...(raw as GradeWeights) } : { ...DEFAULT_GRADE_WEIGHTS }
}

/** Extrait la pondération d'un DTO séance (défaut si absente). */
export function weightsOfSession(session: { weights?: GradeWeights }): GradeWeights {
  return sanitizeGradeWeights(session.weights)
}

export interface ComponentNote {
  /** Note ramenée sur 20 (null = composante indisponible) */
  note: number | null
  /** Affichage du score brut, ex. « 7/8 », « 22/32 », « 2/3 », « 4,2/5 » */
  detail: string
}

export interface FinalGrade {
  irat: ComponentNote
  trat: ComponentNote
  application: ComponentNote
  peer: ComponentNote
  /** Note finale sur 20 (null = aucune composante disponible) */
  final: number | null
  /** Poids effectivement utilisés, ex. « 25 % · 25 % · 35 % · 15 % » */
  weightsLabel: string
}

function pct(score: number, max: number): number {
  return max > 0 ? (score / max) * 20 : 0
}

/** Format français : 14,5 (1 décimale) */
export function fmtNote(n: number | null, decimals = 1): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return n.toFixed(decimals).replace('.', ',')
}

/** Pourcentage net pour l'affichage : 25 → « 25 », 12,5 → « 12,5 ». */
export function fmtWeightPct(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',')
}

/**
 * Libellé des poids EFFECTIFS : si une composante manque, son poids
 * est redistribué — on affiche alors les poids renormalisés suivis
 * de « (renormalisé) », comme avant la v3.5.0.
 */
function effectiveWeightsLabel(
  w: GradeWeights,
  present: { irat: boolean; trat: boolean; application: boolean; peer: boolean }
): string {
  const all = w.irat + w.trat + w.application + w.peer
  const parts: { label: string; w: number; present: boolean }[] = [
    { label: 'iRAT', w: w.irat, present: present.irat },
    { label: 'tRAT', w: w.trat, present: present.trat },
    { label: 'Application', w: w.application, present: present.application },
    { label: 'Pairs', w: w.peer, present: present.peer },
  ]
  const totalW = parts.filter((p) => p.present).reduce((s, p) => s + p.w, 0)
  const allPresent = totalW > 0 && Math.abs(totalW - all) < 0.01
  const shown = parts.map((p) =>
    p.present && totalW > 0 ? (p.w / totalW) * all : 0
  )
  const label = shown.map((v) => `${fmtWeightPct(Math.round(v * 10) / 10)} %`).join(' · ')
  return allPresent ? label : `${label} (renormalisé)`
}

export function computeFinalGrade(
  input: {
    iratScore: number | null
    iratMax: number
    tratScore: number | null
    tratMax: number
    appScore: number | null
    appMax: number
    peerAvg: number | null
  },
  weights: GradeWeights = DEFAULT_GRADE_WEIGHTS
): FinalGrade {
  const irat: ComponentNote = {
    note: input.iratScore !== null && input.iratMax > 0 ? pct(input.iratScore, input.iratMax) : null,
    detail: input.iratMax > 0 ? `${input.iratScore ?? 0}/${input.iratMax}` : '—',
  }
  const trat: ComponentNote = {
    note: input.tratScore !== null && input.tratMax > 0 ? pct(input.tratScore, input.tratMax) : null,
    detail: input.tratMax > 0 ? `${input.tratScore ?? 0}/${input.tratMax}` : '—',
  }
  const application: ComponentNote = {
    note:
      input.appScore !== null && input.appMax > 0 ? pct(input.appScore, input.appMax) : null,
    detail: input.appMax > 0 ? `${input.appScore ?? 0}/${input.appMax}` : '—',
  }
  const peer: ComponentNote = {
    note: input.peerAvg !== null ? pct(input.peerAvg, 5) : null,
    detail: input.peerAvg !== null ? `${fmtNote(input.peerAvg)}/5` : '—',
  }

  const parts: { w: number; note: number }[] = []
  if (irat.note !== null) parts.push({ w: weights.irat, note: irat.note })
  if (trat.note !== null) parts.push({ w: weights.trat, note: trat.note })
  if (application.note !== null) parts.push({ w: weights.application, note: application.note })
  if (peer.note !== null) parts.push({ w: weights.peer, note: peer.note })

  const totalW = parts.reduce((s, p) => s + p.w, 0)
  const final = totalW > 0 ? parts.reduce((s, p) => s + p.w * p.note, 0) / totalW : null

  const weightsLabel = effectiveWeightsLabel(weights, {
    irat: irat.note !== null,
    trat: trat.note !== null,
    application: application.note !== null,
    peer: peer.note !== null,
  })

  return { irat, trat, application, peer, final, weightsLabel }
}

// ---------- Côté enseignant : à partir des données du tableau de bord ----------

export function gradeForStudent(
  data: DashboardDTO,
  studentId: string
): FinalGrade {
  const ratQs = data.questions.filter((q) => q.phase === 'rat')
  const appQs = data.questions.filter((q) => q.phase === 'application')
  const student = data.students.find((s) => s.id === studentId)
  const team = student?.teamId ? data.teams.find((t) => t.id === student.teamId) : undefined
  const weights = weightsOfSession(data.session)

  const iratScore = data.iratAnswers
    .filter((a) => a.studentId === studentId)
    .reduce((s, a) => s + a.score, 0)

  const tratScore = team
    ? data.tratAnswers.filter((a) => a.teamId === team.id).reduce((s, a) => s + a.score, 0)
    : null

  const appScore = team
    ? appQs.filter((q) => {
        const ans = data.appAnswers.find((x) => x.questionId === q.id && x.teamId === team.id)
        return ans !== undefined && ans.choice === q.correct
      }).length
    : null

  const received = data.peerEvals.filter((e) => e.evaluatedId === studentId)
  const peerAvg =
    received.length > 0 ? received.reduce((s, e) => s + e.score, 0) / received.length : null

  return computeFinalGrade(
    {
      iratScore,
      iratMax: ratQs.length,
      tratScore,
      tratMax: ratQs.length * 4,
      appScore,
      appMax: appQs.length,
      peerAvg,
    },
    weights
  )
}

// ---------- v2.6.0 : rang de l'étudiant dans la séance ----------
//
// Classement « sportif » (1, 2, 2, 4…) : les ex æquo partagent le même
// rang, le suivant saute les places. Seuls les étudiants ayant une note
// finale calculable (au moins une composante disponible) sont classés.

export interface RankInput {
  studentId: string
  final: number | null
}

export interface StudentRank {
  /** 1 = meilleure note. Ex æquo → même rang. */
  rank: number
  /** Nombre total d'étudiants classés (note calculable) */
  total: number
}

/**
 * Rang d'un étudiant parmi les notes finales de la séance.
 * Renvoie null si l'étudiant est introuvable ou sans note calculable.
 */
export function computeRankFor(finals: RankInput[], studentId: string): StudentRank | null {
  const graded = finals.filter((f) => f.final !== null && Number.isFinite(f.final))
  const mine = finals.find((f) => f.studentId === studentId)
  if (!mine || mine.final === null || !Number.isFinite(mine.final)) return null
  const rank = 1 + graded.filter((f) => (f.final as number) > (mine.final as number)).length
  return { rank, total: graded.length }
}

// ---------- Côté étudiant : à partir de son état personnel ----------
// (Utilitaire de repli : en production, la note de l'étudiant vient
// du serveur — computeAllFinalGrades — qui applique la pondération
// de la séance ; les réponses correctes ne quittent jamais le
// serveur en fin de séance.)

export function gradeForStudentSelf(
  data: StudentStateDTO,
  weights: GradeWeights = DEFAULT_GRADE_WEIGHTS
): FinalGrade {
  const ratQs = data.questions
  const appQs = data.applicationQuestions

  const iratScore = data.myIratAnswers.reduce((s, a) => s + (a.score ?? 0), 0)
  const hasTeam = data.me.team !== null
  const tratScore = hasTeam
    ? data.teamTratAnswers.reduce((s, a) => s + a.score, 0)
    : null
  const appScore = hasTeam
    ? appQs.filter((q) => {
        const ans = data.teamAppAnswers.find((x) => x.questionId === q.id)
        return ans !== undefined && q.correct !== undefined && ans.choice === q.correct
      }).length
    : null
  const peerAvg = data.myPeerReceived && data.myPeerReceived.count > 0 ? data.myPeerReceived.avg : null

  return computeFinalGrade(
    {
      iratScore,
      iratMax: ratQs.length,
      tratScore,
      tratMax: ratQs.length * 4,
      appScore,
      appMax: appQs.length,
      peerAvg,
    },
    weights
  )
}
