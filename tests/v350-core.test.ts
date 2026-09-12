// ============================================================
// TBL Live v3.5.0 — Tests unitaires de la pondération
// configurable de la note finale :
//  1. Validation : isValidGradeWeights (somme 100, bornes 0–100,
//     tolérance d'arrondi, entrées cassées) ;
//  2. sanitizeGradeWeights : repli sur la répartition historique
//     25/25/35/15 (null, objet absent, sauvegarde antérieure) ;
//  3. computeFinalGrade : poids personnalisés, renormalisation
//     quand une composante manque, libellé des poids ;
//  4. gradeForStudent : la pondération du DTO séance est appliquée.
// ============================================================

import { describe, expect, it, vi } from 'vitest'

// Les modules testés importent @/lib/db (Prisma) : mocké — ces tests
// ne touchent JAMAIS la base.
vi.mock('@/lib/db', () => ({ db: {} }))

import {
  computeFinalGrade,
  gradeForStudent,
  isValidGradeWeights,
  sanitizeGradeWeights,
  DEFAULT_GRADE_WEIGHTS,
  fmtWeightPct,
  type GradeWeights,
} from '@/lib/grades'
import type { DashboardDTO } from '@/lib/tbl-types'

const DEFAULTS: GradeWeights = { irat: 25, trat: 25, application: 35, peer: 15 }

// ============================================================
// 1. Validation d'une pondération reçue
// ============================================================
describe('isValidGradeWeights', () => {
  it('accepte la répartition historique 25/25/35/15', () => {
    expect(isValidGradeWeights(DEFAULTS)).toBe(true)
  })

  it('accepte une répartition personnalisée sommant à 100', () => {
    expect(isValidGradeWeights({ irat: 40, trat: 30, application: 20, peer: 10 })).toBe(true)
  })

  it('accepte les demi-points et la tolérance d’arrondi (99,999…)', () => {
    expect(isValidGradeWeights({ irat: 12.5, trat: 12.5, application: 50, peer: 25 })).toBe(true)
    expect(
      isValidGradeWeights({ irat: 25.0001, trat: 24.9999, application: 35, peer: 15 })
    ).toBe(true)
  })

  it('refuse une somme différente de 100', () => {
    expect(isValidGradeWeights({ irat: 50, trat: 50, application: 50, peer: 50 })).toBe(false)
    expect(isValidGradeWeights({ irat: 25, trat: 25, application: 35, peer: 14 })).toBe(false)
  })

  it('refuse les poids hors bornes ou non finis', () => {
    expect(isValidGradeWeights({ irat: -1, trat: 25, application: 35, peer: 41 })).toBe(false)
    expect(isValidGradeWeights({ irat: 101, trat: 25, application: 35, peer: -61 })).toBe(false)
    expect(
      isValidGradeWeights({ irat: Number.NaN, trat: 25, application: 35, peer: 40 })
    ).toBe(false)
  })

  it('refuse null / undefined / types cassés', () => {
    expect(isValidGradeWeights(null)).toBe(false)
    expect(isValidGradeWeights(undefined)).toBe(false)
    expect(isValidGradeWeights('25/25/35/15')).toBe(false)
    expect(isValidGradeWeights({ irat: '25', trat: 25, application: 35, peer: 15 })).toBe(false)
    expect(isValidGradeWeights({})).toBe(false)
  })
})

// ============================================================
// 2. Repli propre (sanitize)
// ============================================================
describe('sanitizeGradeWeights', () => {
  it('garde une pondération valide telle quelle', () => {
    const w = { irat: 40, trat: 30, application: 20, peer: 10 }
    expect(sanitizeGradeWeights(w)).toEqual(w)
  })

  it('retombe sur la répartition historique si l’entrée est invalide ou absente', () => {
    expect(sanitizeGradeWeights(null)).toEqual(DEFAULTS)
    expect(sanitizeGradeWeights(undefined)).toEqual(DEFAULTS)
    expect(sanitizeGradeWeights({ irat: 60, trat: 60, application: 60, peer: 60 })).toEqual(DEFAULTS)
    expect(sanitizeGradeWeights({})).toEqual(DEFAULTS)
  })

  it('DEFAULT_GRADE_WEIGHTS vaut la répartition historique 25/25/35/15', () => {
    expect(DEFAULT_GRADE_WEIGHTS).toEqual(DEFAULTS)
  })
})

// ============================================================
// 3. Calcul avec pondération personnalisée
// ============================================================
describe('computeFinalGrade (poids personnalisés)', () => {
  // 8 questions RAT : iRAT parfait (8/8 → 20/20), tRAT parfait
  // (32/32 → 20/20), application 0/2 (→ 0/20), pairs 5/5 (→ 20/20).
  const input = {
    iratScore: 8,
    iratMax: 8,
    tratScore: 32,
    tratMax: 32,
    appScore: 0,
    appMax: 2,
    peerAvg: 5,
  }

  it('défaut 25/25/35/15 : 0,25·20 + 0,25·20 + 0,35·0 + 0,15·20 = 13', () => {
    const g = computeFinalGrade(input)
    expect(g.final).toBeCloseTo(13, 5)
    expect(g.weightsLabel).toBe('25 % · 25 % · 35 % · 15 %')
  })

  it('poids personnalisés 40/30/20/10 : 0,4·20 + 0,3·20 + 0,2·0 + 0,1·20 = 16', () => {
    const g = computeFinalGrade(input, { irat: 40, trat: 30, application: 20, peer: 10 })
    expect(g.final).toBeCloseTo(16, 5)
    expect(g.weightsLabel).toBe('40 % · 30 % · 20 % · 10 %')
  })

  it('un poids à 0 retire la composante du calcul (50/50/0/0 → iRAT+tRAT seuls)', () => {
    const g = computeFinalGrade(input, { irat: 50, trat: 50, application: 0, peer: 0 })
    expect(g.final).toBeCloseTo(20, 5)
    // Toutes les composantes « présentes » au sens des données : pas de
    // renormalisation affichée (application et pairs VALENT 0).
    expect(g.weightsLabel).toBe('50 % · 50 % · 0 % · 0 %')
  })

  it('composante INDISPONIBLE : redistribution proportionnelle des poids restants', () => {
    // Pas d’évaluations par les pairs, pas d’application : il reste
    // iRAT (40) + tRAT (30) = 70 → renormalisés à 100.
    const g = computeFinalGrade(
      { ...input, appScore: null, appMax: 0, peerAvg: null },
      { irat: 40, trat: 30, application: 20, peer: 10 }
    )
    // 40/70·20 + 30/70·20 = 20 — et le libellé est marqué renormalisé.
    expect(g.final).toBeCloseTo(20, 5)
    expect(g.weightsLabel).toContain('(renormalisé)')
    expect(g.weightsLabel).toContain('57,1 %')
    expect(g.weightsLabel).toContain('42,9 %')
  })

  it('aucune composante disponible → note null même avec des poids', () => {
    const g = computeFinalGrade(
      { iratScore: null, iratMax: 0, tratScore: null, tratMax: 0, appScore: null, appMax: 0, peerAvg: null },
      { irat: 40, trat: 30, application: 20, peer: 10 }
    )
    expect(g.final).toBeNull()
  })
})

// ============================================================
// 4. Pondération du DTO séance appliquée côté enseignant
// ============================================================
describe('gradeForStudent (DTO avec weights)', () => {
  const base = {
    session: { weights: { irat: 40, trat: 30, application: 20, peer: 10 } },
    questions: [
      { id: 'q1', text: 'Q1', choices: ['A', 'B'], correct: 0, phase: 'rat' as const },
      { id: 'q2', text: 'Q2', choices: ['A', 'B'], correct: 0, phase: 'rat' as const },
    ],
    cases: [],
    teams: [{ id: 't1', name: 'Équipe 1', number: 1, appealsDone: false }],
    students: [{ id: 's1', name: 'Alice', teamId: 't1', recoveryCode: 'ABC123', saiCompletedAt: null }],
    iratAnswers: [
      { questionId: 'q1', studentId: 's1', choice: 0, isCorrect: true, score: 1 },
      { questionId: 'q2', studentId: 's1', choice: 0, isCorrect: true, score: 1 },
    ],
    // tRAT : Q1 juste au premier grattage (4 pts), Q2 au 3ᵉ (1 pt)
    // → 5/8 → 12,5/20 ; pairs : 3/5 → 12/20 ; pas de questions
    // d'application → composante absente (renormalisation).
    tratAnswers: [
      { questionId: 'q1', teamId: 't1', choice: 0, attempt: 1, isCorrect: true, score: 4 },
      { questionId: 'q2', teamId: 't1', choice: 0, attempt: 3, isCorrect: true, score: 1 },
    ],
    appeals: [],
    appAnswers: [],
    peerEvals: [{ evaluatorId: 'x', evaluatedId: 's1', score: 3, comment: null }],
  }

  it('applique la pondération de la séance (40/30/20/10)', () => {
    const g = gradeForStudent(base as unknown as DashboardDTO, 's1')
    // iRAT 20/20 · tRAT 12,5/20 · application NULL · pairs 12/20 ;
    // poids présents 40+30+10 = 80 → (800+375+120)/80 = 16,1875.
    expect(g.final).toBeCloseTo(16.1875, 4)
    expect(g.weightsLabel).toContain('(renormalisé)')
  })

  it('sans weights dans le DTO : répartition historique', () => {
    const g = gradeForStudent(
      { ...base, session: {} } as unknown as DashboardDTO,
      's1'
    )
    // Poids présents 25+25+15 = 65 → (500+312,5+180)/65 = 15,2692…
    expect(g.final).toBeCloseTo(992.5 / 65, 4)
  })
})

// ============================================================
// 5. Format d’affichage des pourcentages
// ============================================================
describe('fmtWeightPct', () => {
  it('entiers sans décimale, demi-points à la française', () => {
    expect(fmtWeightPct(25)).toBe('25')
    expect(fmtWeightPct(12.5)).toBe('12,5')
    expect(fmtWeightPct(33.33)).toBe('33,3')
    expect(fmtWeightPct(0)).toBe('0')
  })
})
