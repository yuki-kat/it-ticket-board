import type { CsvValue } from './exportCsv'

const encoder = new TextEncoder()

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function column(index: number): string {
  let name = ''
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name
  return name
}

function cell(value: CsvValue, row: number, index: number): string {
  const reference = `${column(index)}${row}`
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`
  if (typeof value === 'boolean') return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`
  const content = value == null ? '' : String(value)
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(content)}</t></is></c>`
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(parts: { name: string; data: Uint8Array }[]): Uint8Array {
  const files = parts.map((part) => ({ ...part, filename: encoder.encode(part.name), checksum: crc32(part.data) }))
  const localSize = files.reduce((size, file) => size + 30 + file.filename.length + file.data.length, 0)
  const centralSize = files.reduce((size, file) => size + 46 + file.filename.length, 0)
  const bytes = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(bytes.buffer)
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true)
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true)
  let offset = 0
  const locations: number[] = []
  for (const file of files) {
    locations.push(offset)
    u32(offset, 0x04034b50)
    u16(offset + 4, 20)
    u16(offset + 6, 0x0800)
    u16(offset + 8, 0)
    u16(offset + 10, 0)
    u16(offset + 12, 0)
    u32(offset + 14, file.checksum)
    u32(offset + 18, file.data.length)
    u32(offset + 22, file.data.length)
    u16(offset + 26, file.filename.length)
    u16(offset + 28, 0)
    offset += 30
    bytes.set(file.filename, offset)
    offset += file.filename.length
    bytes.set(file.data, offset)
    offset += file.data.length
  }
  const directoryOffset = offset
  files.forEach((file, index) => {
    u32(offset, 0x02014b50)
    u16(offset + 4, 20)
    u16(offset + 6, 20)
    u16(offset + 8, 0x0800)
    u16(offset + 10, 0)
    u16(offset + 12, 0)
    u16(offset + 14, 0)
    u32(offset + 16, file.checksum)
    u32(offset + 20, file.data.length)
    u32(offset + 24, file.data.length)
    u16(offset + 28, file.filename.length)
    u16(offset + 30, 0)
    u16(offset + 32, 0)
    u16(offset + 34, 0)
    u16(offset + 36, 0)
    u32(offset + 38, 0)
    u32(offset + 42, locations[index])
    offset += 46
    bytes.set(file.filename, offset)
    offset += file.filename.length
  })
  u32(offset, 0x06054b50)
  u16(offset + 4, 0)
  u16(offset + 6, 0)
  u16(offset + 8, files.length)
  u16(offset + 10, files.length)
  u32(offset + 12, offset - directoryOffset)
  u32(offset + 16, directoryOffset)
  u16(offset + 20, 0)
  return bytes
}

export type XlsxSheet = { name: string; headers: string[]; rows: CsvValue[][] }

function sheetXml(headers: string[], rows: CsvValue[][]): string {
  const data = [headers, ...rows]
  const sheetRows = data.map((row, index) => `<row r="${index + 1}">${row.map((value, cellIndex) => cell(value, index + 1, cellIndex)).join('')}</row>`).join('')
  const widths = headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(45, Math.max(12, header.length + 3))}" customWidth="1"/>`).join('')
  const range = `A1:${column(headers.length - 1)}${data.length}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="${range}"/></worksheet>`
}

/** Downloads one .xlsx workbook with a sheet for each entry in `sheets`. */
export function exportXlsxWorkbook(filename: string, sheets: XlsxSheet[]): void {
  const used = new Set<string>()
  const names = sheets.map((sheet, index) => {
    const base = sheet.name.replace(/[\\/*?:\[\]]/g, '').slice(0, 31) || `Sheet${index + 1}`
    let name = base
    for (let copy = 2; used.has(name.toLowerCase()); copy++) name = `${base.slice(0, 28)} ${copy}`
    used.add(name.toLowerCase())
    return name
  })
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const sheetTags = names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const parts = [
    { name: '[Content_Types].xml', data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`) },
    { name: '_rels/.rels', data: encoder.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`) },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: encoder.encode(sheetXml(sheet.headers, sheet.rows)) })),
  ]
  const workbook = zip(parts)
  const url = URL.createObjectURL(new Blob([workbook as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportXlsx(filename: string, sheetName: string, headers: string[], rows: CsvValue[][]): void {
  exportXlsxWorkbook(filename, [{ name: sheetName, headers, rows }])
}
