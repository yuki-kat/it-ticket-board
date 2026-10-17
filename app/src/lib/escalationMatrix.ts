import { readXlsx, XlsxError, cellIndex, type XlsxBook } from './xlsxRead'

/**
 * Escalation matrix imported from an Excel workbook (Tools → Escalation matrix → Import from Excel).
 *
 * Reads three parts of a sheet named like "Escalation Matrix": the priority table (Priority … First Response …),
 * routing by ticket type (Ticket Type | Covers | Tier 1 …) and the contact directory (the ContactDirectory table, or a
 * Role | Name | Phone | Email header on the same sheet). Sections are found by their header text, not fixed rows, so
 * added or moved rows still import. Other sheets (a search page, org charts, audit notes) are ignored.
 *
 * The result is kept in this browser (and in backups). It drives the matrix panel and the escalation email drafts;
 * SLA timers on tickets keep the board's built-in timings.
 */

export type PriorityLevel = 'P1' | 'P2' | 'P3' | 'P4'
export type ImportedPriority = { level: PriorityLevel; label: string; definition: string; examples: string; response: string; tier2: string; tier3: string; notifyManager: string; resolution: string }
export type ImportedRoute = { ticketType: string; covers: string; tier1: string; tier2: string; tier3: string; final: string; queue: string }
export type ImportedContact = { role: string; name: string; phone: string; email: string; emails: string[]; hours: string; languages: string }
export type ImportedMatrix = { fileName: string; importedAt: string; sheet: string; priorities: ImportedPriority[]; routes: ImportedRoute[]; contacts: ImportedContact[] }
export type TierContact = { tier: string; role: string; when: string; name: string; email: string; phone: string }

export const ESCALATION_MATRIX_KEY = 'it-ticket-kanban-escalation-matrix-v1'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g
const tidy = (value: string | undefined) => (value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
/** Workbook placeholders ("[Fill in]", "[Confirm]", "Not available – use email") count as not provided. */
export const provided = (value: string | undefined) => {
  const text = tidy(value)
  return !text || /^\[(fill in|confirm)[^\]]*\]$/i.test(text) || /^not (available|provided)\b/i.test(text) || /^(n\/?a|—|-|tbc|tbd)$/i.test(text) ? '' : text
}
const lower = (value: string | undefined) => tidy(value).toLowerCase()

type Grid = string[][]
/** Column index of the first header cell containing any of the words. */
const column = (header: string[], ...words: string[]) => header.findIndex((cell) => words.some((word) => lower(cell).includes(word)))

function priorities(grid: Grid): ImportedPriority[] {
  const start = grid.findIndex((row) => row && lower(row[0]) === 'priority' && row.some((cell) => lower(cell).includes('first response')))
  if (start < 0) return []
  const header = grid[start]
  const at = { definition: column(header, 'definition'), examples: column(header, 'example'), response: column(header, 'first response', 'response'), tier2: column(header, 'tier 2'), tier3: column(header, 'tier 3'), notify: column(header, 'notify', 'manager'), resolution: column(header, 'resolution') }
  const get = (row: string[], index: number) => index < 0 ? '' : provided(row[index])
  const out: ImportedPriority[] = []
  for (let r = start + 1; r < grid.length; r++) {
    const row = grid[r] || []
    const match = /^\s*(P[1-4])\b\s*[-–—:]?\s*(.*)$/i.exec(row[0] || '')
    if (!match) { if (out.length) break; continue }
    const level = match[1].toUpperCase() as PriorityLevel
    if (out.some((item) => item.level === level)) continue
    out.push({ level, label: tidy(match[2]) || level, definition: get(row, at.definition), examples: get(row, at.examples), response: get(row, at.response), tier2: get(row, at.tier2), tier3: get(row, at.tier3), notifyManager: get(row, at.notify), resolution: get(row, at.resolution) })
  }
  return out
}

function routes(grid: Grid): ImportedRoute[] {
  // Two sections start with "Ticket Type": routing (column B "Covers") and who-to-notify (column B "P1 - Critical").
  const start = grid.findIndex((row) => row && lower(row[0]) === 'ticket type' && lower(row[1]).startsWith('covers'))
  if (start < 0) return []
  const header = grid[start]
  const at = { tier1: column(header, 'tier 1'), tier2: column(header, 'tier 2'), tier3: column(header, 'tier 3'), final: column(header, 'final'), queue: column(header, 'queue') }
  const get = (row: string[], index: number) => index < 0 ? '' : provided(row[index])
  const out: ImportedRoute[] = []
  for (let r = start + 1; r < grid.length; r++) {
    const row = grid[r] || []
    const type = provided(row[0])
    if (!type || /^\d+\.\s/.test(type)) break // a blank row or the next numbered section ends the table
    out.push({ ticketType: type, covers: provided(row[1]), tier1: get(row, at.tier1), tier2: get(row, at.tier2), tier3: get(row, at.tier3), final: get(row, at.final), queue: get(row, at.queue) })
  }
  return out
}

function contactsFromRows(header: string[], rows: string[][]): ImportedContact[] {
  const at = { role: column(header, 'role'), name: column(header, 'name'), phone: column(header, 'phone'), email: column(header, 'email', 'e-mail'), hours: column(header, 'hours', 'coverage'), languages: column(header, 'language') }
  if (at.role < 0 && at.name < 0) return []
  const get = (row: string[], index: number) => index < 0 ? '' : provided(row[index])
  return rows.map((row) => {
    const email = get(row, at.email)
    return { role: get(row, at.role), name: get(row, at.name), phone: get(row, at.phone), email, emails: [...new Set(email.match(EMAIL) || [])], hours: get(row, at.hours), languages: get(row, at.languages) }
  }).filter((contact) => contact.role || contact.name)
}

function contacts(book: XlsxBook, sheetName: string, grid: Grid): ImportedContact[] {
  const table = book.tables.find((item) => item.sheet === sheetName && /contact/i.test(item.name)) || book.tables.find((item) => /^contactdirectory$/i.test(item.name))
  if (table) {
    const [from, to] = table.ref.split(':').map(cellIndex)
    const tableGrid = book.sheets.find((sheet) => sheet.name === table.sheet)?.rows || []
    if (from && to && from[0] >= 0) {
      const slice = (row: string[] = []) => row.slice(from[1], to[1] + 1)
      return contactsFromRows(slice(tableGrid[from[0]]), tableGrid.slice(from[0] + 1, to[0] + 1).map(slice))
    }
  }
  const start = grid.findIndex((row) => row && lower(row[0]) === 'role' && lower(row[1]) === 'name')
  if (start < 0) return []
  const rows: string[][] = []
  for (let r = start + 1; r < grid.length && (grid[r] || []).some((cell) => tidy(cell)); r++) rows.push(grid[r])
  return contactsFromRows(grid[start], rows)
}

/** Reads an escalation matrix out of an .xlsx workbook. Throws XlsxError with a readable message when it can't. */
export async function importEscalationMatrix(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ImportedMatrix> {
  if (!/\.xlsx$/i.test(file.name)) throw new XlsxError('Choose an Excel workbook (.xlsx). Older .xls files can be saved as .xlsx from Excel first.')
  const book = await readXlsx(await file.arrayBuffer())
  const named = book.sheets.find((sheet) => /escalation\s*matrix/i.test(sheet.name))
  const candidates = named ? [named, ...book.sheets.filter((sheet) => sheet !== named)] : book.sheets
  for (const sheet of candidates) {
    const found = { priorities: priorities(sheet.rows), routes: routes(sheet.rows) }
    if (!found.priorities.length && !found.routes.length) continue
    return { fileName: file.name, importedAt: new Date().toISOString(), sheet: sheet.name, ...found, contacts: contacts(book, sheet.name, sheet.rows) }
  }
  throw new XlsxError('No escalation matrix was found in this workbook. It needs a "Priority … First Response" table or a "Ticket Type | Covers | Tier 1" routing table.')
}

// Stored copy, kept in memory too so ticket cards can read it without prop drilling.
let current: ImportedMatrix | null | undefined
const isMatrix = (value: unknown): value is ImportedMatrix => Boolean(value && typeof value === 'object' && Array.isArray((value as ImportedMatrix).priorities) && Array.isArray((value as ImportedMatrix).routes) && Array.isArray((value as ImportedMatrix).contacts))

export function loadImportedMatrix(): ImportedMatrix | null {
  if (current !== undefined) return current
  try { const parsed = JSON.parse(localStorage.getItem(ESCALATION_MATRIX_KEY) || 'null'); current = isMatrix(parsed) ? parsed : null } catch { current = null }
  return current
}
export function saveImportedMatrix(matrix: ImportedMatrix) {
  current = matrix
  try { localStorage.setItem(ESCALATION_MATRIX_KEY, JSON.stringify(matrix)) } catch { /* storage full or blocked: the import still applies until reload */ }
}
export function clearImportedMatrix() {
  current = null
  try { localStorage.removeItem(ESCALATION_MATRIX_KEY) } catch { /* ignore */ }
}

/** The directory entry a routing cell refers to, e.g. "Desktop Engineer (USD Shinagawa)" → the "Desktop Engineer" row. */
export function contactFor(text: string, directory: ImportedContact[]) {
  const value = lower(text)
  return directory.filter((contact) => contact.role && value.startsWith(lower(contact.role))).sort((a, b) => b.role.length - a.role.length)[0]
}

/** Tier 1–3 contacts for escalation: the general Incident route of the import, or the built-in placeholders. */
export function tierContacts(builtIn: TierContact[]): TierContact[] {
  const matrix = loadImportedMatrix()
  const route = matrix?.routes.find((item) => /incident/i.test(item.ticketType)) || matrix?.routes[0]
  if (!matrix || !route) return builtIn
  return [route.tier1, route.tier2, route.tier3].map((text, index) => {
    const contact = text ? contactFor(text, matrix.contacts) : undefined
    return { tier: `Tier ${index + 1}`, role: text || builtIn[index].role, when: builtIn[index].when, name: contact?.name || text || builtIn[index].name, email: contact?.emails[0] || '', phone: contact?.phone || '' }
  })
}

/** Tier 2 / Tier 3 escalation time for a priority from the import, if it has one. */
export function importedThreshold(priority: string, nextTier: 2 | 3) {
  const row = loadImportedMatrix()?.priorities.find((item) => priority.startsWith(item.level))
  return row ? (nextTier === 2 ? row.tier2 : row.tier3) : ''
}
