// ============================================================
// TBL Live v2.7.0 — Générateur de fichiers Excel (.xlsx) SANS
// dépendance externe. Excel = une archive ZIP de fichiers XML ;
// ce module construit l'archive à la main (méthode « store »,
// sans compression — gain de temps, taille raisonnable pour
// quelques milliers de cellules) et produit un Blob téléchargeable.
//
// Choix techniques :
//  - chaînes « inline » (<c t="inlineStr">) : pas de table
//    sharedStrings à maintenir, aucune limite de longueur ;
//  - nombres typés : Excel peut trier / calculer dessus ;
//  - 3 styles : normal (0), en-tête gras (1), titre gras
//    multi-lignes (2) ;
//  - caractères d'échappement XML neutralisés (& < > " ');
//  - polices Calibri 11 : rendu identique partout.
//
// Les cellules ne sont JAMAIS des formules (t="inlineStr" ou
// nombre brut) : l'« injection de formule » du CSV est impossible
// de par le format XLSX lui-même.
// ============================================================

export interface XlsxCell {
  /** Valeur de la cellule (nombre typé ou texte brut) */
  v: string | number
  /** 0 = normal, 1 = gras (en-tête), 2 = gras + retour à la ligne */
  s?: 0 | 1 | 2
}

/** Rangée = liste de cellules (une par colonne, dans l'ordre). */
export type XlsxRow = (string | number | XlsxCell | null | undefined)[]

export interface XlsxSheet {
  /** Nom de l'onglet (max 31 caractères, sans []:*?/\) */
  name: string
  /** Largeur des colonnes en caractères (défaut 12) */
  widths?: number[]
  rows: XlsxRow[]
  /** Figer la première ligne (en-têtes) — défaut true */
  freezeRow?: boolean
}

// ---------- Échappement XML ----------

function xml(s: string): string {
  let out = ''
  for (const ch of s) {
    switch (ch) {
      case '&':
        out += '&amp;'
        break
      case '<':
        out += '&lt;'
        break
      case '>':
        out += '&gt;'
        break
      case '"':
        out += '&quot;'
        break
      case "'":
        out += '&apos;'
        break
      default: {
        const code = ch.codePointAt(0) ?? 0
        // Caractères de contrôle interdits en XML (vérrouillés par Excel)
        if (code < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r') {
          out += ' '
        } else {
          out += ch
        }
      }
    }
  }
  return out
}

// ---------- Lettres de colonne (A, B, …, Z, AA, AB, …) ----------

function colName(i: number): string {
  let out = ''
  let n = i
  while (n >= 0) {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  }
  return out
}

// ---------- CRC32 (IEEE 802.3, table pré-calculée) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ---------- Archive ZIP (méthode « store », UTF-8) ----------

interface ZipEntry {
  name: string
  data: Uint8Array
}

const encoder = new TextEncoder()

/** Numéros de date DOS : 1980-01-01 minimal, contenu non significatif. */
const DOS_TIME = ((0 << 11) | (0 << 5) | 0) & 0xffff // 00:00:00
const DOS_DATE = (((2024 - 1980) << 9) | (1 << 5) | 1) & 0xffff // 2024-01-01

function buildZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff]
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + name.length)
    local.set(
      u32(0x04034b50), // signature « local file header »
      0
    )
    local.set(u16(20), 4) // version minimale pour « store »
    local.set(u16(0x0800), 6) // drapeau : nom encodé UTF-8
    local.set(u16(0), 8) // méthode 0 = store (sans compression)
    local.set(u16(DOS_TIME), 10)
    local.set(u16(DOS_DATE), 12)
    local.set(u32(crc), 14)
    local.set(u32(entry.data.length), 18) // taille compressée = taille
    local.set(u32(entry.data.length), 22) // taille décompressée
    local.set(u16(name.length), 26)
    local.set(u16(0), 28) // pas de champ « extra »
    local.set(name, 30)

    chunks.push(local, entry.data)

    const cd = new Uint8Array(46 + name.length)
    cd.set(u32(0x02014b50), 0) // signature « central directory »
    cd.set(u16(20), 4) // version créée par
    cd.set(u16(20), 6) // version minimale
    cd.set(u16(0x0800), 8) // UTF-8
    cd.set(u16(0), 10) // méthode store
    cd.set(u16(DOS_TIME), 12)
    cd.set(u16(DOS_DATE), 14)
    cd.set(u32(crc), 16)
    cd.set(u32(entry.data.length), 20)
    cd.set(u32(entry.data.length), 24)
    cd.set(u16(name.length), 28)
    // attributs / disque / commentaires : zéro
    cd.set(u32(offset), 42) // position de l'en-tête local
    cd.set(name, 46)
    central.push(cd)

    offset += local.length + entry.data.length
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  end.set(u32(0x06054b50), 0) // signature « end of central directory »
  end.set(u16(entries.length), 8) // entrées sur ce disque
  end.set(u16(entries.length), 10) // entrées au total
  end.set(u32(centralSize), 12)
  end.set(u32(offset), 16) // position de la directory

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of [...chunks, ...central, end]) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

// ---------- Feuille XML ----------

function cellToXml(cell: XlsxRow[number]): XlsxCell {
  if (cell === null || cell === undefined) return { v: '', s: 0 }
  if (typeof cell === 'string' || typeof cell === 'number') return { v: cell, s: 0 }
  return { v: cell.v, s: cell.s ?? 0 }
}

function sheetXml(sheet: XlsxSheet): string {
  const freeze = sheet.freezeRow !== false
  let body = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  body +=
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"'
  if (freeze) {
    body +=
      '><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>'
  } else {
    body += '/>'
  }
  body += '</sheetViews><sheetFormatPr defaultRowHeight="15"/>'

  // Largeurs de colonnes
  const widths = sheet.widths ?? []
  const colCount = Math.max(
    widths.length,
    sheet.rows.reduce((m, r) => Math.max(m, r.length), 0)
  )
  if (colCount > 0) {
    body += '<cols>'
    for (let c = 0; c < colCount; c++) {
      const w = Math.min(80, Math.max(4, widths[c] ?? 12))
      body += `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`
    }
    body += '</cols>'
  }

  body += '<sheetData>'
  sheet.rows.forEach((row, r) => {
    body += `<row r="${r + 1}">`
    row.forEach((raw, c) => {
      const cell = cellToXml(raw)
      const ref = `${colName(c)}${r + 1}`
      if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
        body += `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`
      } else {
        const text = String(cell.v)
        if (text === '') return // cellule vide : élément omis
        body +=
          `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`
      }
    })
    body += '</row>'
  })
  body += '</sheetData></worksheet>'
  return body
}

// ---------- Document complet ----------

function sheetNameSafe(name: string, index: number): string {
  let n = name.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31)
  if (!n) n = `Feuille ${index + 1}`
  return n
}

/**
 * Construit le classeur Excel et le renvoie en Blob (téléchargeable
 * via URL.createObjectURL). Fonctionne côté navigateur uniquement
 * (TextEncoder/Blob sont disponibles partout).
 */
export function buildXlsx(sheets: XlsxSheet[]): Blob {
  if (sheets.length === 0) throw new Error('Aucune feuille à générer.')

  const usedNames = new Set<string>()
  const safeSheets = sheets.map((s, i) => {
    let name = sheetNameSafe(s.name, i)
    while (usedNames.has(name)) name = `${name.slice(0, 28)} ${i + 1}`
    usedNames.add(name)
    return { ...s, name }
  })

  // [Content_Types].xml
  const overrides = safeSheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('')
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>'

  // _rels/.rels
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'

  // xl/workbook.xml
  const sheetTags = safeSheets
    .map(
      (s, i) =>
        `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
    )
    .join('')
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${sheetTags}</sheets>` +
    '</workbook>'

  // xl/_rels/workbook.xml.rels
  const relTags = safeSheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join(
      ''
    )
  const stylesTag = `<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relTags +
    stylesTag +
    '</Relationships>'

  // xl/styles.xml — 3 styles : 0 normal, 1 gras, 2 gras + renvoi à la ligne
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><color rgb="FF1C1917"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1C1917"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: encoder.encode(styles) },
    ...safeSheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: encoder.encode(sheetXml(s)),
    })),
  ]

  const bytes = buildZip(entries)
  // Copie dans un ArrayBuffer pur : le type Uint8Array<ArrayBufferLike>
  // (TextEncoder) n'est pas accepté par BlobPart dans les lib TS récentes.
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
