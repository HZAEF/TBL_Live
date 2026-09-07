// ============================================================
// TBL Live v2.7.0 — Tests du générateur Excel (src/lib/xlsx.ts)
// La méthode « store » (sans compression) rend le contenu
// directement vérifiable octet par octet dans l'archive.
// ============================================================

import { describe, expect, it } from 'vitest'
import { buildXlsx, type XlsxSheet } from '../src/lib/xlsx'

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

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let out = ''
  for (let i = start; i < start + len; i++) out += String.fromCharCode(bytes[i])
  return out
}

describe('buildXlsx', () => {
  const sheets: XlsxSheet[] = [
    {
      name: 'Résultats',
      widths: [24, 14, 10],
      rows: [
        ['Étudiant', 'Équipe', 'Note'],
        ['Léa Dupont', 'Équipe 1', 15.5],
        ['Karim & Co <test>', '—', { v: 'Acceptée', s: 1 }],
      ],
    },
    {
      name: 'Docimologie',
      freezeRow: false,
      rows: [['p', 'D'], [0.62, 0.41]],
    },
  ]

  it('produit une archive ZIP valide (signatures locales + EOCD)', async () => {
    const bytes = await toBytes(buildXlsx(sheets))
    // Signature « local file header » du premier fichier
    expect(ascii(bytes, 0, 4)).toBe('PK\x03\x04')
    // Signature « end of central directory » présente
    const eocd = findText(bytes, 'PK\x05\x06')
    expect(eocd).toBeGreaterThan(0)
    // Nombre d'entrées = 5 parties communes + 2 feuilles = 7
    expect(bytes[eocd + 10]).toBe(7)
    expect(bytes[eocd + 11]).toBe(0)
  })

  it('contient toutes les parties XML requises', async () => {
    const bytes = await toBytes(buildXlsx(sheets))
    expect(findText(bytes, '[Content_Types].xml')).toBeGreaterThan(0)
    expect(findText(bytes, '_rels/.rels')).toBeGreaterThan(0)
    expect(findText(bytes, 'xl/workbook.xml')).toBeGreaterThan(0)
    expect(findText(bytes, 'xl/_rels/workbook.xml.rels')).toBeGreaterThan(0)
    expect(findText(bytes, 'xl/styles.xml')).toBeGreaterThan(0)
    expect(findText(bytes, 'xl/worksheets/sheet1.xml')).toBeGreaterThan(0)
    expect(findText(bytes, 'xl/worksheets/sheet2.xml')).toBeGreaterThan(0)
  })

  it('inscrit les noms d’onglets et le contenu sans compression', async () => {
    const bytes = await toBytes(buildXlsx(sheets))
    // workbook.xml référence les feuilles par leur nom
    expect(findText(bytes, 'name="Résultats"')).toBeGreaterThan(0)
    expect(findText(bytes, 'name="Docimologie"')).toBeGreaterThan(0)
    // Contenu texte des cellules (inline strings)
    expect(findText(bytes, 'Étudiant')).toBeGreaterThan(0)
    expect(findText(bytes, 'Léa Dupont')).toBeGreaterThan(0)
    // Nombres typés : <v>15.5</v>
    expect(findText(bytes, '<v>15.5</v>')).toBeGreaterThan(0)
    expect(findText(bytes, '<v>0.62</v>')).toBeGreaterThan(0)
  })

  it('échappe les caractères XML dans les textes', async () => {
    const bytes = await toBytes(buildXlsx(sheets))
    expect(findText(bytes, 'Karim &amp; Co &lt;test&gt;')).toBeGreaterThan(0)
    // Jamais de « & » nu dans le XML des cellules
    const cellText = findText(bytes, 'Karim')
    expect(cellText).toBeGreaterThan(0)
    // « Karim & Co » → l’esperluette est échappée juste après l’espace
    expect(ascii(bytes, cellText + 5, 3)).toBe(' &a')
    // jamais d’esperluette nue suivie d’une lettre (would be an entity)
    expect(findText(bytes, '&C')).toBe(-1)
  })

  it('applique les styles gras et fige la première ligne si demandé', async () => {
    const bytes = await toBytes(buildXlsx(sheets))
    expect(findText(bytes, 's="1"')).toBeGreaterThan(0)
    expect(findText(bytes, 'state="frozen"')).toBeGreaterThan(0)
  })

  it('nettoie les noms d’onglets invalides (trop longs, caractères interdits)', async () => {
    const bytes = await toBytes(
      buildXlsx([
        { name: 'Questionnaire d’évaluation complet de fin de séance TBL-SAI', rows: [['x']] },
        { name: 'A/B:C*D?', rows: [['y']] },
      ])
    )
    // Le nom est tronqué à 31 caractères, sans / ni ?
    const found = findText(bytes, 'Questionnaire d’évaluation com')
    expect(found).toBeGreaterThan(0)
    // caractères interdits remplacés par des espaces (trim enlève le final)
    expect(findText(bytes, 'name="A B C D"')).toBeGreaterThan(0)
  })

  it('ignore les cellules vides (pas de balise <c> vide)', async () => {
    const bytes = await toBytes(
      buildXlsx([{ name: 'T', rows: [['a', null, undefined, '', 'b']] }])
    )
    expect(findText(bytes, '<is><t xml:space="preserve">')).toBeGreaterThan(0)
    // 2 cellules texte seulement : a et b
    expect(findText(bytes, '>a</t>')).toBeGreaterThan(0)
    expect(findText(bytes, '>b</t>')).toBeGreaterThan(0)
  })
})
