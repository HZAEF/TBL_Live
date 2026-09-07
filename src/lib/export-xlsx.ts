// ============================================================
// TBL Live v2.7.0 — Export Excel « fin de séance » : TROIS
// feuilles dans un seul classeur .xlsx :
//   1. « Résultats »     : le tableau habituel des résultats
//      (iRAT question par question, totaux, application, pairs,
//      notes sur 20, note finale) ;
//   2. « Docimologie »   : analyse docimologique complète
//      (synthèse par section, analyse des questions, effet
//      équipe iRAT → tRAT, questions à revoir) ;
//   3. « Questionnaire » : résultats du questionnaire de fin de
//      séance TBL-SAI (moyennes par item, sous-échelles PAR
//      ÉTUDIANT, commentaires libres).
//
// Module client (exécuté dans le navigateur de l'enseignant) —
// les calculs docimologiques viennent de src/lib/docimology.ts
// (module pur, déjà testé par tests/docimology.test.ts).
// ============================================================

import { t, formatDate } from './i18n'
import type { DashboardDTO } from './tbl-types'
import { LETTERS } from './tbl-types'
import { gradeForStudent } from './grades'
import { SAI_SUBSCALES, SAI_SUBSCALE_INFO, saiSubscaleMean, saiItemText } from './sai'
import {
  alphaInterp,
  analyzeSection,
  buildApplicationSection,
  buildComparison,
  buildIratSection,
  buildTratSection,
  flagQuestions,
  fmtPct,
  type SectionAnalysis,
  type SectionKind,
} from './docimology'
import { buildXlsx, type XlsxRow, type XlsxSheet } from './xlsx'

// Lettre d'un choix (A, B, C…) — identique à choiceLetter des composants,
// réimporté ici en local pour garder ce module PUR (testable sans React).
function choiceLetter(index: number): string {
  return LETTERS[index] ?? '?'
}

// Arrondi propre (évite les 0.62000000001 du calcul flottant).
function r2(x: number | null): number | null {
  return x === null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100
}

/** Cellule numérique avec repli « — » (texte) quand la valeur est absente. */
function num(x: number | null | undefined): string | number {
  const v = r2(x ?? null)
  return v === null ? '—' : v
}

// ============================================================
// FEUILLE 1 — Résultats (le tableau habituel)
// ============================================================

export function resultsSheet(
  data: DashboardDTO,
  ratQs: DashboardDTO['questions'],
  appQs: DashboardDTO['questions']
): XlsxSheet {
  const rows: XlsxRow[] = []

  // En-tête document : titre de la séance, code, date d'export
  rows.push([{ v: data.session.title, s: 1 }])
  rows.push([t('Code : {code}', { code: data.session.code }), t('Exporté le {date}', { date: formatDate(new Date()) })])
  rows.push([])

  const caseById = new Map(data.cases.map((c) => [c.id, c]))
  const appColumnLabel = (q: DashboardDTO['questions'][number], i: number) => {
    const c = q.caseId ? caseById.get(q.caseId) : undefined
    return c
      ? `${t('Application')} ${c.order + 1} Q${appQs.filter((x) => x.caseId === q.caseId).indexOf(q) + 1}`
      : `${t('Exercice')} ex.${i + 1}`
  }

  const header: XlsxRow = [
    { v: t('Étudiant'), s: 1 },
    { v: t('Équipe'), s: 1 },
    ...ratQs.map((_, i) => ({ v: `iRAT Q${i + 1}`, s: 1 as const })),
    { v: t('iRAT total (sur {n})', { n: ratQs.length }), s: 1 },
    { v: t('tRAT équipe (total sur {n})', { n: ratQs.length * 4 }), s: 1 },
    ...appQs.map((q, i) => ({ v: appColumnLabel(q, i), s: 1 as const })),
    { v: t('Note pairs (moyenne sur 5)'), s: 1 },
    { v: t('iRAT sur 20 (25%)'), s: 1 },
    { v: t('tRAT sur 20 (25%)'), s: 1 },
    { v: t('Application sur 20 (35%)'), s: 1 },
    { v: t('Pairs sur 20 (15%)'), s: 1 },
    { v: t('NOTE FINALE sur 20'), s: 1 },
  ]
  rows.push(header)

  for (const s of data.students) {
    const team = data.teams.find((t2) => t2.id === s.teamId)
    const iratCells: (string | number)[] = ratQs.map((q) => {
      const a = data.iratAnswers.find((x) => x.questionId === q.id && x.studentId === s.id)
      return a ? (a.isCorrect ? '✓' : choiceLetter(a.choice)) : ''
    })
    const iratTotal = data.iratAnswers
      .filter((a) => a.studentId === s.id)
      .reduce((sum, a) => sum + a.score, 0)
    const tratTotal = team
      ? data.tratAnswers.filter((a) => a.teamId === team.id).reduce((sum, a) => sum + a.score, 0)
      : 0
    const appCells: (string | number)[] = appQs.map((q) => {
      const a = team ? data.appAnswers.find((x) => x.questionId === q.id && x.teamId === team.id) : null
      return a ? choiceLetter(a.choice) : ''
    })
    const received = data.peerEvals.filter((e) => e.evaluatedId === s.id)
    const peerAvg =
      received.length > 0
        ? Math.round((received.reduce((sum, e) => sum + e.score, 0) / received.length) * 10) / 10
        : ''
    const g = gradeForStudent(data, s.id)
    rows.push([
      s.name,
      team?.name ?? '—',
      ...iratCells,
      iratTotal,
      tratTotal,
      ...appCells,
      peerAvg,
      num(g.irat.note),
      num(g.trat.note),
      num(g.application.note),
      num(g.peer.note),
      num(g.final),
    ])
  }

  // ---- Réclamations (une ligne par réclamation : qui · décision /
  //      texte de la question, puis la justification) ----
  if (data.appeals.length > 0) {
    rows.push([])
    rows.push([{ v: t('Réclamations'), s: 1 }])
    for (const a of data.appeals) {
      const team = data.teams.find((tm) => tm.id === a.teamId)
      const q = data.questions.find((x) => x.id === a.questionId)
      const ratIndex = q ? ratQs.findIndex((x) => x.id === q.id) : -1
      const qLabel = ratIndex >= 0 ? `Q${ratIndex + 1}` : t('Question')
      const decision =
        a.status === 'accepted' ? t('Acceptée') : a.status === 'rejected' ? t('Refusée') : t('En attente')
      rows.push([
        { v: `${team?.name ?? ''} · ${qLabel} · ${decision}`, s: 2 },
        { v: q?.text ?? '', s: 2 },
      ])
      rows.push(['', { v: a.text, s: 2 }])
    }
  }

  // ---- Commentaires de l'évaluation par les pairs ----
  const withComments = data.peerEvals.filter((e) => e.comment)
  if (withComments.length > 0) {
    rows.push([])
    rows.push([{ v: t('Évaluation par les pairs'), s: 1 }, { v: t('Commentaire'), s: 1 }])
    for (const e of withComments) {
      const from = data.students.find((s) => s.id === e.evaluatorId)?.name ?? ''
      const to = data.students.find((s) => s.id === e.evaluatedId)?.name ?? ''
      rows.push([
        { v: `${from} → ${to} (${e.score}/5)`, s: 2 },
        { v: e.comment ?? '', s: 2 },
      ])
    }
  }

  const qCols = Math.max(ratQs.length, 1)
  const appCols = Math.max(appQs.length, 1)
  const widths = [
    26, // étudiant / libellé
    30, // équipe / texte long (renvoi à la ligne)
    ...Array(qCols).fill(8), // iRAT Q1..Qn
    14, // iRAT total
    14, // tRAT total
    ...Array(appCols).fill(9), // application
    12, // pairs
    12,
    12,
    14,
    12,
    14, // note finale
  ]
  return { name: t('Résultats'), widths, rows }
}

// ============================================================
// FEUILLE 2 — Docimologie
// ============================================================

export function docimologySheet(data: DashboardDTO): XlsxSheet {
  const rows: XlsxRow[] = []
  const sections: { kind: SectionKind; label: string; analysis: SectionAnalysis }[] = []

  const irat = buildIratSection(data)
  if (irat.questions.length > 0 && irat.respondents.length > 0) {
    sections.push({ kind: 'irat', label: t('iRAT (individuel)'), analysis: analyzeSection(irat) })
  }
  const trat = buildTratSection(data)
  if (trat.questions.length > 0 && trat.respondents.length > 0) {
    sections.push({ kind: 'trat', label: t('tRAT (équipes)'), analysis: analyzeSection(trat) })
  }
  const application = buildApplicationSection(data)
  if (application.questions.length > 0 && application.respondents.length > 0) {
    sections.push({
      kind: 'application',
      label: t('Application (équipes)'),
      analysis: analyzeSection(application),
    })
  }

  if (sections.length === 0) {
    return {
      name: t('Docimologie'),
      rows: [[{ v: t('Aucune réponse pour le moment.'), s: 1 }]],
    }
  }

  // ---- 1. Synthèse par section ----
  rows.push([{ v: t('1. SYNTHÈSE PAR SECTION'), s: 1 }])
  rows.push(
    [
      t('Section'),
      t('Répondants'),
      t('Questions'),
      t('Score max'),
      t('Moyenne (points)'),
      t('Écart-type'),
      t('Moyenne /20'),
      t('Médiane (points)'),
      t('Fidélité (alpha)'),
      t('Interprétation fidélité'),
      t('SEM (points)'),
      t('Répondants complets'),
    ].map((v) => ({ v, s: 1 as const }))
  )
  for (const sec of sections) {
    const test = sec.analysis.test
    rows.push([
      sec.label,
      test.n,
      test.k,
      test.maxScore,
      num(test.mean),
      num(test.sd),
      num(test.mean20),
      num(test.median),
      num(test.alpha),
      test.alpha === null ? '—' : t(alphaInterp(test.alpha).label),
      num(test.sem),
      test.nComplete,
    ])
  }

  if (sections.some((s) => s.analysis.test.n < 8)) {
    rows.push([t('Effectif réduit : indices indicatifs.')])
  }
  rows.push([])

  // ---- 2. Analyse des questions ----
  rows.push([{ v: t('ANALYSE DES QUESTIONS'), s: 1 }])
  for (const sec of sections) {
    rows.push([{ v: secLabel(sec.kind), s: 1 }])
    const header: XlsxRow = [
      { v: t('Question'), s: 1 },
      { v: t('Intitulé'), s: 1 },
      { v: t('Répondants'), s: 1 },
      { v: t('Réussite'), s: 1 },
      { v: t('Moyenne'), s: 1 },
      { v: t('Indice de discrimination (D)'), s: 1 },
      { v: t('Corrélation point-bisériale (r pbs)'), s: 1 },
      { v: t('Répartition'), s: 1 },
      { v: t('Bonne réponse'), s: 1 },
    ]
    if (sec.kind === 'trat') {
      header.splice(4, 0, { v: t('1ᵉʳ essai'), s: 1 })
      header.splice(5, 0, { v: t('Pts moyens /4'), s: 1 })
      header.push(
        { v: t('4 pts'), s: 1 },
        { v: t('2 pts'), s: 1 },
        { v: t('1 pt'), s: 1 },
        { v: t('0 pt'), s: 1 }
      )
    }
    rows.push(header)
    for (const it of sec.analysis.items) {
      const repartition = it.options
        .map((o) => `${o.label} ${o.count}${o.isCorrect ? ' ✓' : ''}`)
        .join(' · ')
      const row: XlsxRow = [
        it.question.label,
        { v: it.question.text, s: 2 },
        it.n,
        it.p === null ? '—' : fmtPct(it.p),
        num(it.avgScore),
        num(it.d),
        num(it.rpbs),
        repartition,
        LETTERS[it.question.correct] ?? '',
      ]
      if (sec.kind === 'trat') {
        row.splice(4, 0, it.pFirst === null ? '—' : fmtPct(it.pFirst))
        row.splice(5, 0, num(it.avgScore))
        row.push(
          it.ifat?.c4 ?? 0,
          it.ifat?.c2 ?? 0,
          it.ifat?.c1 ?? 0,
          it.ifat?.c0 ?? 0
        )
      }
      rows.push(row)
    }
    rows.push([])
  }

  // ---- 3. Effet équipe : iRAT → tRAT ----
  const iratSection = sections.find((s) => s.kind === 'irat')
  const tratSection = sections.find((s) => s.kind === 'trat')
  if (iratSection && tratSection) {
    const comparison = buildComparison(iratSection.analysis, tratSection.analysis)
    if (comparison.length > 0) {
      rows.push([{ v: t('Effet équipe : iRAT → tRAT'), s: 1 }])
      rows.push(
        [
          t('Question'),
          t('Réussite individus'),
          t('Équipes 1ᵉʳ essai'),
          t('Équipes au final'),
          t('Gain équipe'),
        ].map((v) => ({ v, s: 1 as const }))
      )
      for (const c of comparison) {
        rows.push([
          c.question.label,
          c.pIrat === null ? '—' : fmtPct(c.pIrat),
          c.pTratFirst === null ? '—' : fmtPct(c.pTratFirst),
          c.pTratFinal === null ? '—' : fmtPct(c.pTratFinal),
          c.gain === null ? '—' : fmtPct(c.gain),
        ])
      }
      rows.push([])
    }
  }

  // ---- 4. Questions à revoir ----
  const flagged = flagQuestions(
    sections.map((s) => ({ kind: s.kind, analysis: s.analysis }))
  )
  if (flagged.length > 0) {
    rows.push([{ v: t('Questions à revoir ({n})', { n: flagged.length }), s: 1 }])
    rows.push([{ v: t('Question'), s: 1 }, { v: t('Intitulé'), s: 1 }, { v: t('Justification'), s: 1 }])
    for (const f of flagged) {
      rows.push([
        f.label,
        { v: f.text, s: 2 },
        { v: f.problems.join(' ; '), s: 2 },
      ])
    }
  }

  const widths = [22, 55, 12, 12, 12, 12, 14, 14, 22, 18, 12, 14, 12, 12, 12, 10, 10, 10, 10]
  return { name: t('Docimologie'), widths, rows, freezeRow: false }
}

function secLabel(kind: SectionKind): string {
  if (kind === 'irat') return t('Analyse des questions — iRAT (répondants : étudiants)')
  if (kind === 'trat') return t('Analyse des questions — tRAT (répondants : équipes)')
  return t('Analyse des questions — application et cas cliniques (répondants : équipes)')
}

// ============================================================
// FEUILLE 3 — Questionnaire d'évaluation (TBL-SAI)
// ============================================================

export function saiSheet(data: DashboardDTO): XlsxSheet {
  const rows: XlsxRow[] = []
  const items = data.saiItems
  const completed = data.saiStats?.completed ?? 0
  const subscaleOf = new Map(items.map((it) => [it.id, it.subscale]))
  const reversedOf = new Map(items.map((it) => [it.id, it.reversed]))
  const textOf = new Map(
    items.map((it) => [it.id, it.text ?? (it.textKey ? t(it.textKey) : '')])
  )

  rows.push([{ v: t('Questionnaire de fin de séance (TBL-SAI)'), s: 1 }])
  rows.push([
    t('Questionnaires complétés : {n} / {m}', { n: completed, m: data.students.length }),
  ])
  rows.push([])

  // ---- Réponses aux items (moyenne par item) ----
  if (items.length > 0) {
    rows.push([{ v: t('Réponses aux items'), s: 1 }])
    rows.push(
      [
        { v: t('Question'), s: 1 },
        { v: t('Intitulé'), s: 1 },
        { v: t('Sous-échelle de l’item'), s: 1 },
        { v: t('Item inversé (formulation négative)'), s: 1 },
        { v: t('Répondants'), s: 1 },
        { v: t('Moyenne de l’item'), s: 1 },
      ]
    )
    const statsByItem = new Map((data.saiStats?.items ?? []).map((s) => [s.id, s]))
    items.forEach((it, i) => {
      const stat = statsByItem.get(it.id)
      rows.push([
        `I${i + 1}`,
        { v: textOf.get(it.id) ?? saiItemText(it), s: 2 },
        t(SAI_SUBSCALE_INFO[it.subscale].labelKey),
        it.reversed ? '✓' : '',
        stat?.n ?? 0,
        stat && stat.n > 0 ? Math.round(stat.mean * 100) / 100 : '—',
      ])
    })
    rows.push([])
  }

  // ---- Moyennes de sous-échelles PAR ÉTUDIANT ----
  const responses = data.saiResponses ?? []
  if (responses.length > 0) {
    const byStudent = new Map<string, { itemId: string; value: number }[]>()
    for (const r of responses) {
      const list = byStudent.get(r.studentId) ?? []
      list.push({ itemId: r.itemId, value: r.value })
      byStudent.set(r.studentId, list)
    }
    rows.push([{ v: t('Résultats du questionnaire'), s: 1 }])
    rows.push([
      { v: t('Étudiant'), s: 1 },
      ...SAI_SUBSCALES.map((sc) => ({ v: t(SAI_SUBSCALE_INFO[sc].labelKey), s: 1 as const })),
      { v: t('Moyenne'), s: 1 },
      { v: t('Commentaire'), s: 1 },
    ])
    const saiCommentByStudent = new Map(
      (data.saiStats?.comments ?? []).map((c) => [c.studentName, c.comment])
    )
    const order = data.students
      .filter((s) => byStudent.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    for (const s of order) {
      const list = byStudent.get(s.id) ?? []
      const row: XlsxRow = [s.name]
      let globalValues: { value: number; reversed: boolean }[] = []
      for (const sc of SAI_SUBSCALES) {
        const sub = list
          .filter((r) => subscaleOf.get(r.itemId) === sc)
          .map((r) => ({ value: r.value, reversed: reversedOf.get(r.itemId) ?? false }))
        globalValues = globalValues.concat(sub)
        const mean = saiSubscaleMean(sub)
        row.push(mean === null ? '—' : Math.round(mean * 100) / 100)
      }
      const global = saiSubscaleMean(globalValues)
      row.push(global === null ? '—' : Math.round(global * 100) / 100)
      row.push(saiCommentByStudent.get(s.name) ?? '')
      rows.push(row)
    }
    rows.push([])
    rows.push([t('Moyenne (1 à 5) — items inversés pris en compte')])
  }

  const widths = [24, 55, 30, 14, 12, 14, 14, 14, 14, 12, 50]
  return { name: t('Questionnaire'), widths, rows, freezeRow: false }
}

// ============================================================
// Point d'entrée : construit le classeur et déclenche le
// téléchargement dans le navigateur de l'enseignant.
// ============================================================

export function exportXlsx(
  data: DashboardDTO,
  ratQs: DashboardDTO['questions'],
  appQs: DashboardDTO['questions']
): void {
  const sheets: XlsxSheet[] = [
    resultsSheet(data, ratQs, appQs),
    docimologySheet(data),
    saiSheet(data),
  ]
  const blob = buildXlsx(sheets)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `resultats-tbl-${data.session.code}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
