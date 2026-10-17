/**
 * Minimal .xlsx reader for the browser: enough to read cell text and named tables, with no library.
 *
 * An .xlsx file is a ZIP of XML parts. Entries are found through the ZIP central directory (local headers can carry
 * zero sizes when a data descriptor is used), inflated with the built-in DecompressionStream, and parsed with
 * DOMParser. Sizes are capped so a malformed or hostile file can't exhaust memory. Values come back as plain strings;
 * nothing from the file is ever evaluated or inserted as HTML.
 */

export const MAX_XLSX_BYTES = 10 * 1024 * 1024
const MAX_ENTRY_BYTES = 30 * 1024 * 1024

export class XlsxError extends Error {}

export type XlsxSheet = { name: string; rows: string[][] }
export type XlsxTable = { name: string; sheet: string; ref: string }
export type XlsxBook = { sheets: XlsxSheet[]; tables: XlsxTable[] }

type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number }

function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new XlsxError('This file is not an Excel workbook (.xlsx).')
  const count = view.getUint16(eocd + 10, true)
  let pos = view.getUint32(eocd + 16, true)
  const entries = new Map<string, ZipEntry>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) throw new XlsxError('The workbook file is damaged.')
    const nameLength = view.getUint16(pos + 28, true)
    const extraLength = view.getUint16(pos + 30, true)
    const commentLength = view.getUint16(pos + 32, true)
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength))
    entries.set(name, {
      name,
      method: view.getUint16(pos + 10, true),
      compressedSize: view.getUint32(pos + 20, true),
      size: view.getUint32(pos + 24, true),
      offset: view.getUint32(pos + 42, true),
    })
    pos += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_ENTRY_BYTES) { await reader.cancel(); throw new XlsxError('The workbook is too large to read.') }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new XlsxError('The workbook file is damaged.')
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true)
  if (entry.size > MAX_ENTRY_BYTES || start + entry.compressedSize > bytes.length) throw new XlsxError('The workbook is too large or damaged.')
  const data = bytes.subarray(start, start + entry.compressedSize)
  const raw = entry.method === 0 ? data : entry.method === 8 ? await inflate(data) : null
  if (!raw) throw new XlsxError('The workbook uses a compression method this reader does not support.')
  return new TextDecoder().decode(raw)
}

const xml = (text: string) => {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new XlsxError('The workbook contains unreadable XML.')
  return doc
}
const all = (node: Document | Element, tag: string) => [...node.getElementsByTagNameNS('*', tag)]
const relAttr = (element: Element) => element.getAttribute('r:id') || element.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || ''

/** Resolves a relationship target against the folder of the part that owns the .rels file. */
function resolvePath(baseFolder: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = baseFolder.split('/').filter(Boolean)
  for (const piece of target.split('/')) {
    if (piece === '..') parts.pop()
    else if (piece !== '.') parts.push(piece)
  }
  return parts.join('/')
}

async function relationships(bytes: Uint8Array, entries: Map<string, ZipEntry>, relsPath: string, baseFolder: string) {
  const entry = entries.get(relsPath)
  const map = new Map<string, string>()
  if (!entry) return map
  for (const rel of all(xml(await readEntry(bytes, entry)), 'Relationship')) map.set(rel.getAttribute('Id') || '', resolvePath(baseFolder, rel.getAttribute('Target') || ''))
  return map
}

/** Text of a shared-string item or inline string: every run joined, leaving out phonetic (furigana) runs. */
function stringItemText(item: Element) {
  const inPhonetic = (node: Element) => { for (let up = node.parentElement; up && up !== item; up = up.parentElement) if (up.localName === 'rPh') return true; return false }
  return all(item, 't').filter((t) => !inPhonetic(t)).map((t) => t.textContent || '').join('')
}

/** "AB12" → [row 11, column 27] (zero-based). */
export function cellIndex(ref: string): [number, number] {
  const match = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase())
  if (!match) return [-1, -1]
  let column = 0
  for (const letter of match[1]) column = column * 26 + (letter.charCodeAt(0) - 64)
  return [Number(match[2]) - 1, column - 1]
}

export async function readXlsx(buffer: ArrayBuffer): Promise<XlsxBook> {
  if (buffer.byteLength > MAX_XLSX_BYTES) throw new XlsxError('The workbook is larger than 10 MB.')
  const bytes = new Uint8Array(buffer)
  const entries = zipEntries(bytes)
  const workbookEntry = entries.get('xl/workbook.xml')
  if (!workbookEntry) throw new XlsxError('This file is not an Excel workbook (.xlsx).')

  const shared: string[] = []
  const sharedEntry = entries.get('xl/sharedStrings.xml')
  if (sharedEntry) for (const item of all(xml(await readEntry(bytes, sharedEntry)), 'si')) shared.push(stringItemText(item))

  const workbookRels = await relationships(bytes, entries, 'xl/_rels/workbook.xml.rels', 'xl')
  const sheets: XlsxSheet[] = []
  const tables: XlsxTable[] = []
  for (const sheetElement of all(xml(await readEntry(bytes, workbookEntry)), 'sheet')) {
    const name = sheetElement.getAttribute('name') || ''
    const path = workbookRels.get(relAttr(sheetElement))
    const entry = path ? entries.get(path) : undefined
    if (!entry) continue
    const doc = xml(await readEntry(bytes, entry))
    const rows: string[][] = []
    for (const cell of all(doc, 'c')) {
      const [row, column] = cellIndex(cell.getAttribute('r') || '')
      if (row < 0 || column < 0 || row > 100_000 || column > 500) continue
      const type = cell.getAttribute('t')
      const value = all(cell, 'v')[0]?.textContent ?? ''
      const text = type === 's' ? shared[Number(value)] ?? ''
        : type === 'inlineStr' ? all(cell, 'is').map(stringItemText).join('')
        : type === 'b' ? (value === '1' ? 'TRUE' : 'FALSE')
        : value
      ;(rows[row] ||= [])[column] = text
    }
    sheets.push({ name, rows: Array.from(rows, (row) => Array.from(row || [], (value) => value ?? '')) })

    const folder = path!.slice(0, path!.lastIndexOf('/'))
    const sheetRels = await relationships(bytes, entries, `${folder}/_rels/${path!.slice(folder.length + 1)}.rels`, folder)
    for (const part of all(doc, 'tablePart')) {
      const tablePath = sheetRels.get(relAttr(part))
      const tableEntry = tablePath ? entries.get(tablePath) : undefined
      if (!tableEntry) continue
      const table = all(xml(await readEntry(bytes, tableEntry)), 'table')[0]
      if (table) tables.push({ name: table.getAttribute('displayName') || table.getAttribute('name') || '', sheet: name, ref: table.getAttribute('ref') || '' })
    }
  }
  return { sheets, tables }
}
