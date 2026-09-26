// Backup and restore of everything this app keeps in the browser.
//
// The file is JSON: the tickets, deleted tickets, assets and stock as plain lists (the part that matters, and
// what a later import into a database will read), plus the settings. See "Backup and restore" in the README.

export const BACKUP_APP = 'it-ticket-board'
export const BACKUP_FORMAT = 1

const DATA_KEYS = {
  tickets: 'it-ticket-kanban-v1',
  deletedTickets: 'it-ticket-kanban-deleted-v1',
  assets: 'it-ticket-kanban-assets-v1',
  stock: 'it-ticket-kanban-stock-v1',
} as const
export const LAST_BACKUP_KEY = 'it-ticket-kanban-last-backup-v1'
export const BEFORE_RESTORE_KEY = 'it-ticket-kanban-before-restore-v1'

// Everything the app saves starts with one of these. Settings are found by prefix, so a setting added later is included automatically.
const SETTINGS_PREFIXES = ['it-ticket-kanban-', 'ops-kanban-']
const NOT_SETTINGS = new Set<string>([...Object.values(DATA_KEYS), LAST_BACKUP_KEY, BEFORE_RESTORE_KEY, 'ops-kanban-debug-v1'])
const isSetting = (key: string) => SETTINGS_PREFIXES.some((prefix) => key.startsWith(prefix)) && !NOT_SETTINGS.has(key)

export type BackupRecords = { tickets: unknown[]; deletedTickets: unknown[]; assets: unknown[]; stock: unknown[] }
export type BackupCounts = { tickets: number; deletedTickets: number; assets: number; stock: number }
export type BackupFile = { app: typeof BACKUP_APP; format: number; createdAt: string; counts: BackupCounts; records: BackupRecords; settings: Record<string, string> }
export type ParsedBackup = { ok: true; backup: BackupFile } | { ok: false; problems: string[] }

const MAX_FILE_BYTES = 50 * 1024 * 1024

function readList(storage: Storage, key: string): unknown[] {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export const countRecords = (records: BackupRecords): BackupCounts => ({ tickets: records.tickets.length, deletedTickets: records.deletedTickets.length, assets: records.assets.length, stock: records.stock.length })

/** What is saved in this browser right now. */
export function createBackup(storage: Storage = localStorage): BackupFile {
  const records: BackupRecords = { tickets: readList(storage, DATA_KEYS.tickets), deletedTickets: readList(storage, DATA_KEYS.deletedTickets), assets: readList(storage, DATA_KEYS.assets), stock: readList(storage, DATA_KEYS.stock) }
  const settings: Record<string, string> = {}
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    const value = key ? storage.getItem(key) : null
    if (key && value !== null && isSetting(key)) settings[key] = value
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, createdAt: new Date().toISOString(), counts: countRecords(records), records, settings }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** Checks one list of records: each is an object with the required text fields, and no id is used twice. */
function checkList(label: string, list: unknown, idField: string, required: string[], problems: string[]) {
  if (!Array.isArray(list)) { problems.push(`The ${label} are missing or are not a list.`); return }
  const seen = new Set<string>()
  list.forEach((item, position) => {
    const where = `${label} #${position + 1}`
    if (!isObject(item)) { problems.push(`${where} is not a record.`); return }
    for (const field of [idField, ...required]) if (!isText(item[field])) problems.push(`${where} has no ${field}.`)
    const id = item[idField]
    if (isText(id)) {
      if (seen.has(id)) problems.push(`${where} repeats the ${idField} "${id}".`)
      seen.add(id)
    }
  })
}

/** Reads the text of a backup file and says whether it is safe to restore, without changing anything. */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try { data = JSON.parse(text) } catch { return { ok: false, problems: ['This is not a backup file: it could not be read as JSON.'] } }
  if (!isObject(data) || data.app !== BACKUP_APP) return { ok: false, problems: ['This file was not made by the IT Ticket Board.'] }
  if (typeof data.format !== 'number' || data.format < 1) return { ok: false, problems: ['This backup has no version number.'] }
  if (data.format > BACKUP_FORMAT) return { ok: false, problems: [`This backup was made by a newer version of the board (format ${data.format}). Update the board first.`] }
  if (!isObject(data.records)) return { ok: false, problems: ['This backup has no tickets, assets or stock in it.'] }

  const problems: string[] = []
  const records = data.records
  const deleted = records.deletedTickets === undefined ? [] : records.deletedTickets
  checkList('tickets', records.tickets, 'id', ['title', 'status'], problems)
  checkList('deleted tickets', deleted, 'id', ['title'], problems)
  checkList('assets', records.assets, 'id', ['serial'], problems)
  checkList('stock items', records.stock, 'sku', ['name'], problems)
  const settings = data.settings === undefined ? {} : data.settings
  if (!isObject(settings) || Object.values(settings).some((value) => typeof value !== 'string')) problems.push('The settings in this backup are not in the expected form.')
  if (problems.length) return { ok: false, problems: problems.length > 6 ? [...problems.slice(0, 6), `…and ${problems.length - 6} more problems.`] : problems }

  const clean: BackupRecords = { tickets: records.tickets as unknown[], deletedTickets: deleted as unknown[], assets: records.assets as unknown[], stock: records.stock as unknown[] }
  return { ok: true, backup: { app: BACKUP_APP, format: data.format, createdAt: typeof data.createdAt === 'string' ? data.createdAt : '', counts: countRecords(clean), records: clean, settings: settings as Record<string, string> } }
}

/**
 * Puts a backup into this browser, replacing what is there (settings too). The data being replaced is first kept
 * in one place, so the last restore can be undone. The page must be reloaded afterwards.
 */
export function applyBackup(backup: BackupFile, storage: Storage = localStorage) {
  try { storage.setItem(BEFORE_RESTORE_KEY, JSON.stringify(createBackup(storage))) } catch { /* no room to keep it: restore anyway */ }
  const old: string[] = []
  for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key && isSetting(key)) old.push(key) }
  old.forEach((key) => storage.removeItem(key))
  storage.setItem(DATA_KEYS.tickets, JSON.stringify(backup.records.tickets))
  storage.setItem(DATA_KEYS.deletedTickets, JSON.stringify(backup.records.deletedTickets))
  storage.setItem(DATA_KEYS.assets, JSON.stringify(backup.records.assets))
  storage.setItem(DATA_KEYS.stock, JSON.stringify(backup.records.stock))
  for (const [key, value] of Object.entries(backup.settings)) if (isSetting(key)) storage.setItem(key, value)
}

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Downloads a backup of what is saved now, and remembers when. */
export function downloadBackup(storage: Storage = localStorage): BackupFile {
  const backup = createBackup(storage)
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `it-ticket-board-backup-${localDate(new Date())}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  try { storage.setItem(LAST_BACKUP_KEY, backup.createdAt) } catch { /* it just won't show */ }
  return backup
}

export async function readBackupFile(file: File): Promise<ParsedBackup> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, problems: ['This file is too large to be a backup.'] }
  return parseBackup(await file.text())
}

export const lastBackupTime = (storage: Storage = localStorage): string => storage.getItem(LAST_BACKUP_KEY) || ''
