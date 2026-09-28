import { expect, test } from '@playwright/test'
import { applyBackup, BEFORE_RESTORE_KEY, createBackup, putBackPrevious } from '../app/src/backup'
import {
  baseFromRows, changesToSend, emptyBase, fingerprint, looksOffline, mergeList, stableStringify, SYNC_STATE_KEY, TABLES, WORKSPACE_KEY,
  type SyncRecord,
} from '../app/src/syncLogic'

// The rules sync uses to combine this browser's lists with the workspace's database (app/src/syncLogic.ts), and how
// backups treat the sync's own saved state (app/src/backup.ts). These run without a browser.

const tickets = TABLES.find((spec) => spec.table === 'tickets')! // records that arrive go on top, newest first
const assets = TABLES.find((spec) => spec.table === 'assets')! // records that arrive go at the end, by id

/** A base saying the database held exactly these records. */
const baseOf = (...records: SyncRecord[]) => baseFromRows(records, 'id')

test.describe('Sync rules', () => {
  test('the same record always gives the same fingerprint, whatever the order of its fields', () => {
    expect(stableStringify({ b: 1, a: { d: [1, undefined], c: 'x' }, skipped: undefined })).toBe('{"a":{"c":"x","d":[1,null]},"b":1}')
    expect(fingerprint({ id: 'T-1', title: 'Printer', tags: ['a'] })).toBe(fingerprint({ tags: ['a'], title: 'Printer', id: 'T-1' }))
    expect(fingerprint({ id: 'T-1', title: 'Printer' })).not.toBe(fingerprint({ id: 'T-1', title: 'Printer 2' }))
  })

  test('sends records that are new or changed here, and the ones deleted here', () => {
    const same = { id: 'T-1', title: 'Same' }
    const changed = { id: 'T-2', title: 'Changed here' }
    const added = { id: 'T-3', title: 'New here' }
    const base = baseOf(same, { id: 'T-2', title: 'Before' }, { id: 'T-9', title: 'Deleted here' })
    expect(changesToSend([same, changed, added], 'id', base)).toEqual({ upserts: [changed, added], deletes: ['T-9'] })
  })

  test('sends one row per id, even if a list holds the same id twice', () => {
    const first = { id: 'T-1', title: 'First' }
    expect(changesToSend([first, { id: 'T-1', title: 'Second' }], 'id', {})).toEqual({ upserts: [first], deletes: [] })
  })

  test('takes the database’s copy of a record, unless the record was changed here', () => {
    const before = { id: 'T-1', title: 'Before' }
    const theirs = { id: 'T-1', title: 'Changed by a colleague' }
    expect(mergeList([before], tickets, baseOf(before), [theirs])).toEqual([theirs])
    const mine = { id: 'T-1', title: 'Changed here' }
    expect(mergeList([mine], tickets, baseOf(before), [theirs])).toEqual([mine])
  })

  test('keeps records that are new here, and does not bring back records deleted here', () => {
    const kept = { id: 'T-1', title: 'Kept' }
    const added = { id: 'T-2', title: 'New here' }
    const deletedHere = { id: 'T-3', title: 'Deleted here' }
    expect(mergeList([added, kept], tickets, baseOf(kept, deletedHere), [kept, deletedHere])).toEqual([added, kept])
  })

  test('removes records a colleague deleted, unless they were changed here', () => {
    const gone = { id: 'T-1', title: 'Deleted by a colleague' }
    const changedHere = { id: 'T-2', title: 'Changed here' }
    expect(mergeList([gone, changedHere], tickets, baseOf(gone, { id: 'T-2', title: 'Before' }), [])).toEqual([changedHere])
  })

  test('adds records that arrived: tickets on top, newest first; assets at the end, by id', () => {
    const mine = { id: 'T-1', createdAt: '2026-09-01T00:00:00Z' }
    const older = { id: 'T-7', createdAt: '2026-09-02T00:00:00Z' }
    const newer = { id: 'T-8', createdAt: '2026-09-03T00:00:00Z' }
    expect(mergeList([mine], tickets, baseOf(mine), [older, mine, newer])).toEqual([newer, older, mine])
    const laptop = { id: 'A-1' }
    expect(mergeList([laptop], assets, baseOf(laptop), [{ id: 'A-10' }, laptop, { id: 'A-2' }])).toEqual([laptop, { id: 'A-2' }, { id: 'A-10' }])
  })

  test('returns the same list when nothing changed, so the board is not redrawn', () => {
    const list = [{ id: 'T-1', title: 'One' }, { id: 'T-2', title: 'Two' }]
    // The database's copies have their fields in another order (jsonb does not keep it): that is not a change.
    expect(mergeList(list, tickets, baseOf(...list), [{ title: 'Two', id: 'T-2' }, { title: 'One', id: 'T-1' }])).toBe(list)
  })

  test('tells "no connection" apart from the database saying no', () => {
    for (const message of ['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'fetch failed', 'Request timed out'])
      expect(looksOffline(message), message).toBe(true)
    for (const message of ['new row violates row-level security policy for table "tickets"', 'JWT expired', 'denied'])
      expect(looksOffline(message), message).toBe(false)
  })

  test('a new sync starts from an empty base', () => {
    expect(emptyBase()).toEqual({ tickets: {}, deleted_tickets: {}, assets: {}, stock_items: {} })
  })
})

/** A stand-in for the browser's localStorage. */
function memoryStorage(entries: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(entries))
  return {
    get length() { return items.size },
    clear: () => items.clear(),
    getItem: (key: string) => items.get(key) ?? null,
    key: (index: number) => [...items.keys()][index] ?? null,
    removeItem: (key: string) => { items.delete(key) },
    setItem: (key: string, value: string) => { items.set(key, String(value)) },
  } as Storage
}

test.describe('Backups while syncing', () => {
  const ticket = { id: 'OPS-1', title: 'Printer', status: 'New' }
  const syncingBrowser = () => memoryStorage({
    'it-ticket-kanban-v1': JSON.stringify([ticket]),
    'it-ticket-kanban-view-v1': 'list',
    [SYNC_STATE_KEY]: JSON.stringify({ workspaceId: 'ws-1', workspaceName: 'Acme IT', userId: 'me', base: {} }),
    [WORKSPACE_KEY]: 'ws-1',
  })

  test('a backup keeps the settings, but not the sync state or the chosen workspace', () => {
    const backup = createBackup(syncingBrowser())
    expect(backup.records.tickets).toEqual([ticket])
    expect(Object.keys(backup.settings)).toEqual(['it-ticket-kanban-view-v1'])
  })

  test('restoring a backup stops syncing and keeps what was there, so it can be put back', () => {
    const storage = syncingBrowser()
    const other = { id: 'OPS-2', title: 'Laptop', status: 'New' }
    applyBackup({ ...createBackup(memoryStorage()), records: { tickets: [other], deletedTickets: [], assets: [], stock: [] } }, storage)
    expect(storage.getItem(SYNC_STATE_KEY)).toBeNull()
    expect(JSON.parse(storage.getItem('it-ticket-kanban-v1')!)).toEqual([other])
    expect(JSON.parse(storage.getItem(BEFORE_RESTORE_KEY)!).records.tickets).toEqual([ticket])
    expect(putBackPrevious(storage)).toBe(true)
    expect(JSON.parse(storage.getItem('it-ticket-kanban-v1')!)).toEqual([ticket])
    expect(storage.getItem(WORKSPACE_KEY)).toBe('ws-1')
  })
})
