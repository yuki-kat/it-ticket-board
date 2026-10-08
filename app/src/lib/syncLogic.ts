// The rules for keeping this browser and the workspace's database in step. No network and no React here,
// so the rules can be tested on their own (tests/sync-logic.spec.ts).
//
// "Base" is what this browser last knew the database held: one fingerprint per record. Comparing a record
// with its base says whether it changed here since then; comparing the database's copy says whether it
// changed there. See "Sync" in the README for how the two are combined.

/** Where this browser remembers that it syncs, with which workspace, and its base. Not part of backups. */
export const SYNC_STATE_KEY = 'it-ticket-kanban-sync-v1'
/** The workspace this browser last worked in (Settings → Account). Not part of backups. */
export const WORKSPACE_KEY = 'it-ticket-kanban-workspace-v1'

export type SyncRecord = Record<string, unknown>
export type ListName = 'tickets' | 'deletedTickets' | 'assets' | 'stock'
export type SyncLists = Record<ListName, SyncRecord[]>
export type TableName = 'tickets' | 'deleted_tickets' | 'assets' | 'stock_items'
/** Fingerprints by record id, per table. */
export type Base = Record<TableName, Record<string, string>>

export type TableSpec = {
  table: TableName
  list: ListName
  /** The field that identifies a record. */
  key: 'id' | 'sku'
  /** Where records that arrive from the database go: on top (newest first), or at the end. */
  newOnTop: boolean
  /** How records are ordered when a whole list comes from the database. */
  order: (a: SyncRecord, b: SyncRecord) => number
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const newestFirst = (field: string) => (a: SyncRecord, b: SyncRecord) => text(b[field]).localeCompare(text(a[field]))
const byKey = (key: string) => (a: SyncRecord, b: SyncRecord) => text(a[key]).localeCompare(text(b[key]), undefined, { numeric: true })

export const TABLES: TableSpec[] = [
  { table: 'tickets', list: 'tickets', key: 'id', newOnTop: true, order: newestFirst('createdAt') },
  { table: 'deleted_tickets', list: 'deletedTickets', key: 'id', newOnTop: true, order: newestFirst('deletedAt') },
  { table: 'assets', list: 'assets', key: 'id', newOnTop: false, order: byKey('id') },
  { table: 'stock_items', list: 'stock', key: 'sku', newOnTop: false, order: byKey('sku') },
]

export const emptyBase = (): Base => ({ tickets: {}, deleted_tickets: {}, assets: {}, stock_items: {} })

/**
 * JSON with object keys sorted, so the same record always gives the same text. (The database stores
 * records as jsonb, which does not keep key order.) Properties that are undefined are left out, as in JSON.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`
  const entries = Object.keys(value as SyncRecord).sort()
    .filter((key) => (value as SyncRecord)[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as SyncRecord)[key])}`)
  return `{${entries.join(',')}}`
}

/** A short fingerprint of a record: two 32-bit FNV-1a hashes and the length. Equal records give equal fingerprints. */
export function fingerprint(record: unknown): string {
  const input = stableStringify(record)
  let a = 0x811c9dc5
  let b = 0x01000193 ^ input.length
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0
  }
  return `${a.toString(36)}.${b.toString(36)}.${input.length.toString(36)}`
}

export const idOf = (record: SyncRecord, key: string) => String(record[key])

export type TableChanges = { upserts: SyncRecord[]; deletes: string[] }

/** What this browser has to send: records that are new or changed since the base, and records deleted here. */
export function changesToSend(list: SyncRecord[], key: string, base: Record<string, string>): TableChanges {
  const here = new Set<string>()
  const upserts: SyncRecord[] = []
  for (const record of list) {
    const id = idOf(record, key)
    // One row per id: if a list ever holds the same id twice, only the first is sent.
    if (here.has(id)) continue
    here.add(id)
    if (base[id] !== fingerprint(record)) upserts.push(record)
  }
  const deletes = Object.keys(base).filter((id) => !here.has(id))
  return { upserts, deletes }
}

/**
 * Combines this browser's list with the database's rows. Returns the same list object when nothing changes.
 * - A record changed here since the base is kept as it is here (it is sent next).
 * - Otherwise the database's copy is used.
 * - A record new here (not in the base) is kept; one deleted here (in the base, gone here) stays deleted.
 * - A record the database no longer has, but that was in the base, was deleted by someone else: it goes,
 *   unless it was changed here, in which case it is kept and sent again.
 * - A record the database has that this browser never saw is added.
 */
export function mergeList(current: SyncRecord[], spec: TableSpec, base: Record<string, string>, rows: SyncRecord[]): SyncRecord[] {
  const remote = new Map(rows.map((row) => [idOf(row, spec.key), row]))
  const seen = new Set<string>()
  const merged: SyncRecord[] = []
  let changed = false
  for (const record of current) {
    const id = idOf(record, spec.key)
    seen.add(id)
    const changedHere = base[id] !== fingerprint(record)
    const theirs = remote.get(id)
    if (theirs) {
      if (changedHere || fingerprint(theirs) === fingerprint(record)) merged.push(record)
      else { merged.push(theirs); changed = true }
    } else if (base[id] === undefined || changedHere) merged.push(record)
    else changed = true // deleted by someone else
  }
  const arrived = rows.filter((row) => !seen.has(idOf(row, spec.key)) && base[idOf(row, spec.key)] === undefined).sort(spec.order)
  if (!arrived.length) return changed ? merged : current
  return spec.newOnTop ? [...arrived, ...merged] : [...merged, ...arrived]
}

/** The base after reading the database: exactly what it holds now. */
export function baseFromRows(rows: SyncRecord[], key: string): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [idOf(row, key), fingerprint(row)]))
}

/** Whether a message from a failed request means "no connection", as opposed to the database saying no. */
export const looksOffline = (message: string) => /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/i.test(message)
