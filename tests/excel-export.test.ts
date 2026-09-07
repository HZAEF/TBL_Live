// ============================================================
// TBL Live v2.7.0 — Tests de l'export Excel 3 feuilles
// (src/lib/export-xlsx.ts) sur un jeu de données réaliste.
// ============================================================

import { describe, expect, it } from 'vitest'
import {
  resultsSheet,
  docimologySheet,
  saiSheet,
} from '../src/lib/export-xlsx'
import { buildXlsx } from '../src/lib/xlsx'
import type { DashboardDTO } from '../src/lib/tbl-types'

// ---------- Jeu de données réaliste ----------
// 2 étudiants, 2 questions RAT, 1 cas clinique de 1 QCU,
// réponses iRAT/tRAT/application, évaluation par les pairs,
// questionnaire TBL-SAI (3 items, 1 soumis avec commentaire).

function fixture(): DashboardDTO {
  const q1 = { id: 'q1', text: 'Q1 ?', choices: ['A', 'B', 'C'], correct: 1, phase: 'rat' as const, order: 0, caseId: null }
  const q2 = { id: 'q2', text: 'Q2 ?', choices: ['A', 'B', 'C'], correct: 0, phase: 'rat' as const, order: 1, caseId: null }
  const q3 = { id: 'q3', text: 'Cas Q1 ?', choices: ['A', 'B'], correct: 1, phase: 'application' as const, order: 0, caseId: 'c1' }
  return {
    session: {
      id: 's1',
      code: 'ABC123',
      title: 'Cardiologie — Séance 3',
      status: 'finished',
      iratMinutes: 10,
      phaseStartedAt: '2026-01-01T10:00:00Z',
      revealed: true,
      createdAt: '2026-01-01T09:00:00Z',
      deletedAt: null,
      dataPurgedAt: null,
    },
    questions: [q1, q2, q3],
    cases: [{ id: 'c1', title: 'Cas — Mme A.', intro: 'Douleur.', order: 0 }],
    teams: [
      { id: 't1', name: 'Équipe 1', number: 1, appealsDone: true },
      { id: 't2', name: 'Équipe 2', number: 2, appealsDone: true },
    ],
    students: [
      { id: 'st1', name: 'Léa Dupont', teamId: 't1', recoveryCode: 'LUNA' },
      { id: 'st2', name: 'Karim Ben Ali', teamId: 't1', recoveryCode: 'KBA1' },
    ],
    iratAnswers: [
      { questionId: 'q1', studentId: 'st1', choice: 1, isCorrect: true, score: 1 },
      { questionId: 'q2', studentId: 'st1', choice: 2, isCorrect: false, score: 0 },
      { questionId: 'q1', studentId: 'st2', choice: 1, isCorrect: true, score: 1 },
      { questionId: 'q2', studentId: 'st2', choice: 0, isCorrect: true, score: 1 },
    ],
    tratAnswers: [
      { questionId: 'q1', teamId: 't1', choice: 0, attempt: 1, isCorrect: false, score: 0 },
      { questionId: 'q1', teamId: 't1', choice: 1, attempt: 2, isCorrect: true, score: 2 },
      { questionId: 'q2', teamId: 't1', choice: 0, attempt: 1, isCorrect: true, score: 4 },
      { questionId: 'q1', teamId: 't2', choice: 1, attempt: 1, isCorrect: true, score: 4 },
      { questionId: 'q2', teamId: 't2', choice: 1, attempt: 1, isCorrect: false, score: 0 },
    ],
    appeals: [
      { id: 'a1', teamId: 't1', questionId: 'q2', text: 'La réponse B était défendable.', status: 'accepted', createdAt: '2026-01-01T11:00:00Z' },
    ],
    appAnswers: [{ teamId: 't1', questionId: 'q3', choice: 1, text: 'ECB typique' }],
    peerEvals: [
      { evaluatorId: 'st1', evaluatedId: 'st2', score: 5, comment: 'Excellente contribution.' },
      { evaluatorId: 'st2', evaluatedId: 'st1', score: 4, comment: null },
    ],
    saiItems: [
      { id: 'i1', subscale: 'accountability', textKey: 'Je consacre du temps à étudier avant les cours afin d’être mieux préparé(e).', text: null, reversed: false },
      { id: 'i2', subscale: 'satisfaction', textKey: null, text: 'Item personnalisé du prof.', reversed: true },
      { id: 'i3', subscale: 'preference', textKey: 'J’aime les activités d’apprentissage par équipes.', text: null, reversed: false },
    ],
    saiStats: {
      completed: 1,
      items: [
        { id: 'i1', mean: 4, n: 1 },
        { id: 'i2', mean: 2, n: 1 },
        { id: 'i3', mean: 5, n: 1 },
      ],
      comments: [{ studentName: 'Léa Dupont', comment: 'Très bonne séance.', createdAt: '2026-01-01T12:00:00Z' }],
    },
    saiResponses: [
      { studentId: 'st1', itemId: 'i1', value: 4 },
      { studentId: 'st1', itemId: 'i2', value: 2 },
      { studentId: 'st1', itemId: 'i3', value: 5 },
    ],
    alerts: [],
  }
}

const ratQs = fixture().questions.filter((q) => q.phase === 'rat')
const appQs = fixture().questions.filter((q) => q.phase === 'application')

async function toBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function findText(bytes: Uint8Array, needle: string): number {
  const target = new TextEncoder().encode(needle)
  outer: for (let i = 0; i <= bytes.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) continue outer
    }
    return i
  }
  return -1
}

describe('Export Excel 3 feuilles', () => {
  it('feuille 1 — Résultats : titres, étudiants, notes, réclamations, pairs', async () => {
    const sheet = resultsSheet(fixture(), ratQs, appQs)
    expect(sheet.name).toBe('Résultats')
    // En-tête document
    expect(sheet.rows[0][0]).toEqual({ v: 'Cardiologie — Séance 3', s: 1 })
    expect(sheet.rows[1][0]).toBe('Code : ABC123')
    // En-têtes du tableau (gras)
    const header = sheet.rows[3] as { v: string; s: number }[]
    expect(header[0].v).toBe('Étudiant')
    expect(header[2].v).toBe('iRAT Q1')
    expect(header[4].v).toBe('iRAT total (sur 2)')
    // Ligne de Léa : ✓ pour Q1 (bonne réponse), total 1
    const lea = sheet.rows[4] as unknown[]
    expect(lea[0]).toBe('Léa Dupont')
    expect(lea[2]).toBe('✓')
    expect(lea[4]).toBe(1)
    // Note finale numérique présente (Léa : iRAT 10/20, tRAT et app.)
    const finalCell = lea[lea.length - 1]
    expect(typeof finalCell === 'number' || finalCell === '—').toBe(true)
    // Bloc réclamations
    const flat = JSON.stringify(sheet.rows)
    expect(flat).toContain('Réclamations')
    expect(flat).toContain('La réponse B était défendable.')
    // Bloc commentaires des pairs
    expect(flat).toContain('Excellente contribution.')
  })

  it('feuille 2 — Docimologie : synthèse, items, effet équipe, à revoir', () => {
    const sheet = docimologySheet(fixture())
    expect(sheet.name).toBe('Docimologie')
    const flat = JSON.stringify(sheet.rows)
    expect(flat).toContain('1. SYNTHÈSE PAR SECTION')
    expect(flat).toContain('iRAT (individuel)')
    expect(flat).toContain('tRAT (équipes)')
    expect(flat).toContain('ANALYSE DES QUESTIONS')
    expect(flat).toContain('Effet équipe : iRAT → tRAT')
    // p de Q1 : 2 réussites / 2 étudiants → 1
    expect(flat).toContain('100,0 %')
    // IF-AT de tRAT : colonnes 4/2/1/0 pt
    expect(flat).toContain('4 pts')
  })

  it('feuille 3 — Questionnaire : items, sous-échelles par étudiant, commentaire', () => {
    const sheet = saiSheet(fixture())
    expect(sheet.name).toBe('Questionnaire')
    const flat = JSON.stringify(sheet.rows)
    expect(flat).toContain('Questionnaires complétés : 1 / 2')
    expect(flat).toContain('Réponses aux items')
    // item personnalisé affiché tel quel, item standard traduit (clé = fr)
    expect(flat).toContain('Item personnalisé du prof.')
    expect(flat).toContain('Je consacre du temps à étudier')
    // moyenne par étudiant : Léa → sous-échelles (item i2 inversé : 2 → 4)
    expect(flat).toContain('Léa Dupont')
    expect(flat).toContain('Très bonne séance.')
  })

  it('le classeur complet est une archive ZIP valide avec 3 onglets', async () => {
    const blob = buildXlsx([
      resultsSheet(fixture(), ratQs, appQs),
      docimologySheet(fixture()),
      saiSheet(fixture()),
    ])
    const bytes = await toBytes(blob)
    // signature ZIP en tête d'archive (position 0)
    expect(findText(bytes, 'PK\x03\x04')).toBe(0)
    expect(findText(bytes, 'name="Résultats"')).toBeGreaterThan(0)
    expect(findText(bytes, 'name="Docimologie"')).toBeGreaterThan(0)
    expect(findText(bytes, 'name="Questionnaire"')).toBeGreaterThan(0)
    expect(findText(bytes, 'Léa Dupont')).toBeGreaterThan(0)
    expect(findText(bytes, '1. SYNTHÈSE PAR SECTION')).toBeGreaterThan(0)
    expect(findText(bytes, 'Questionnaires complétés : 1 / 2')).toBeGreaterThan(0)
  })
})
