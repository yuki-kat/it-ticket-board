// Keeps this browser's tickets, deleted tickets, assets and stock in step with the workspace's database.
//
// The app keeps working from its own lists (and the browser's storage), exactly as before. While sync is on:
// - every change is sent to the database about a second after it is made;
// - the database is read every 30 seconds, and when the window gets focus or comes back online, so
//   colleagues' changes arrive;
// - with no connection, changes wait in the browser and are sent when it is back.
// The rules for combining the two sides are in syncLogic.ts. See "Sync" in the README.

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { cloud, currentSession, type Workspace } from './cloud'
import { BEFORE_RESTORE_KEY, createBackup } from './backup'
import {
  baseFromRows, changesToSend, emptyBase, fingerprint, idOf, looksOffline, mergeList, SYNC_STATE_KEY, TABLES,
  type Base, type ListName, type SyncLists, type SyncRecord, type TableName, type TableSpec,
} from './syncLogic'

export type SyncPhase = 'off' | 'saving' | 'saved' | 'offline' | 'error'
export type SyncStatus = { phase: SyncPhase; workspaceName: string; lastSyncedAt: string; message: string }
export type StartMode = 'upload' | 'empty' | 'download'

type Saved = { workspaceId: string; workspaceName: string; userId: string; base: Base }
type Updater = (current: SyncRecord[]) => SyncRecord[]
type Adapter = {
  lists: () => SyncLists
  replace: (list: ListName, update: Updater) => void
}
/** One update per list, made from each table's spec. */
const perList = (make: (spec: TableSpec) => Updater) => Object.fromEntries(TABLES.map((spec) => [spec.list, make(spec)])) as Record<ListName, Updater>

const PUSH_DELAY = 800
const POLL_EVERY = 30_000
const RETRY_AFTER = 15_000
const PAGE = 1000
const CHUNK = 200

function readSaved(): Saved | null {
  try {
    const value = JSON.parse(localStorage.getItem(SYNC_STATE_KEY) || 'null') as Saved | null
    if (!value || typeof value.workspaceId !== 'string' || typeof value.userId !== 'string') return null
    return { ...value, workspaceName: String(value.workspaceName || 'your workspace'), base: { ...emptyBase(), ...value.base } }
  } catch { return null }
}
const writeSaved = () => { try { if (saved) localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(saved)) } catch { /* storage full: the next save retries */ } }

let saved: Saved | null = readSaved()
let status: SyncStatus = saved
  ? { phase: 'saving', workspaceName: saved.workspaceName, lastSyncedAt: '', message: '' }
  : { phase: 'off', workspaceName: '', lastSyncedAt: '', message: '' }
const listeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener())
}

let adapter: Adapter | null = null
let running = false
let queued: 'push' | 'full' | null = null
let pushTimer = 0
let retryTimer = 0
let commitWaiters: (() => void)[] = []

/** The sync status, for the top bar and Settings → Account. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => status)
}

export const isSyncing = () => saved !== null

function schedule(kind: 'push' | 'full') {
  if (!saved || !adapter) return
  window.clearTimeout(pushTimer)
  if (kind === 'push') pushTimer = window.setTimeout(() => void run('push'), PUSH_DELAY)
  else void run('full')
}

/** Sends waiting changes now and reads the database. */
export const syncNow = () => schedule('full')

async function run(kind: 'push' | 'full') {
  if (!saved || !adapter) return
  if (running) { queued = queued === 'full' || kind === 'full' ? 'full' : 'push'; return }
  running = true
  try {
    const session = await currentSession()
    if (!saved) return
    if (!session) { setStatus({ phase: 'error', message: 'You are signed out. Sign in again to keep syncing.' }); return }
    if (session.user.id !== saved.userId) { stopSync(); return }
    const sent = await push(session.user.id)
    if (sent && kind === 'full') await pull()
  } finally {
    running = false
    const next = queued
    queued = null
    if (next && saved) void run(next)
  }
}

function failed(message: string) {
  if (looksOffline(message)) {
    setStatus({ phase: 'offline', message: 'No connection. Changes are kept in this browser and sent when the connection is back.' })
    window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(() => schedule('full'), RETRY_AFTER)
  } else {
    setStatus({ phase: 'error', message })
  }
}

/** Sends what changed here since the base. Returns false if it could not. */
async function push(userId: string): Promise<boolean> {
  if (!saved || !adapter) return false
  const workspaceId = saved.workspaceId
  const lists = adapter.lists()
  const plan = TABLES.map((spec) => ({ spec, ...changesToSend(lists[spec.list], spec.key, saved!.base[spec.table]) }))
  if (plan.every((step) => !step.upserts.length && !step.deletes.length)) return true
  setStatus({ phase: 'saving', message: '' })
  const now = new Date().toISOString()
  // New and changed records first, deletions after: a ticket moved to "deleted" is in its new place before it
  // leaves the old one.
  for (const { spec, upserts } of plan) {
    for (let start = 0; start < upserts.length; start += CHUNK) {
      const chunk = upserts.slice(start, start + CHUNK)
      const rows = chunk.map((record) => ({ workspace_id: workspaceId, id: idOf(record, spec.key), owner: userId, data: record, updated_at: now }))
      const { error } = await cloud().from(spec.table).upsert(rows, { onConflict: 'workspace_id,id' })
      if (error) { failed(error.message); return false }
      if (!saved) return false
      for (const record of chunk) saved.base[spec.table][idOf(record, spec.key)] = fingerprint(record)
      writeSaved()
    }
  }
  for (const { spec, deletes } of plan) {
    for (let start = 0; start < deletes.length; start += CHUNK) {
      const ids = deletes.slice(start, start + CHUNK)
      const { error } = await cloud().from(spec.table).delete().eq('workspace_id', workspaceId).in('id', ids)
      if (error) { failed(error.message); return false }
      if (!saved) return false
      for (const id of ids) delete saved.base[spec.table][id]
      writeSaved()
    }
  }
  setStatus({ phase: 'saved', lastSyncedAt: now, message: '' })
  return true
}

/** Every record the workspace has, per table. */
export async function fetchWorkspace(workspaceId: string): Promise<Record<TableName, SyncRecord[]> | { error: string }> {
  const result = {} as Record<TableName, SyncRecord[]>
  for (const { table } of TABLES) {
    const records: SyncRecord[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await cloud().from(table).select('id, data').eq('workspace_id', workspaceId).order('id').range(from, from + PAGE - 1)
      if (error) return { error: error.message }
      for (const row of (data ?? []) as { data: SyncRecord }[]) if (row.data && typeof row.data === 'object') records.push(row.data)
      if (!data || data.length < PAGE) break
    }
    result[table] = records
  }
  return result
}

/** How many records the workspace has, per table (to explain what starting sync will do). */
export async function workspaceCounts(workspaceId: string): Promise<Record<TableName, number> | { error: string }> {
  const result = {} as Record<TableName, number>
  for (const { table } of TABLES) {
    const { count, error } = await cloud().from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId)
    if (error) return { error: error.message }
    result[table] = count ?? 0
  }
  return result
}

/** Applies list changes to the app and waits until they are on screen (so a following send sees them). */
function applyLists(updates: Record<ListName, Updater>): Promise<void> {
  if (!adapter) return Promise.resolve()
  const lists = adapter.lists()
  const needed = (Object.entries(updates) as [ListName, Updater][]).filter(([list, update]) => update(lists[list]) !== lists[list])
  if (!needed.length) return Promise.resolve()
  const done = new Promise<void>((resolve) => {
    commitWaiters.push(resolve)
    window.setTimeout(resolve, 500) // in case nothing ends up changing on screen
  })
  for (const [list, update] of needed) adapter.replace(list, update)
  return done
}

async function pull() {
  if (!saved) return
  const workspaceId = saved.workspaceId
  const rows = await fetchWorkspace(workspaceId)
  if ('error' in rows) { failed(rows.error); return }
  if (!saved || saved.workspaceId !== workspaceId) return
  const base = saved.base
  await applyLists(perList((spec) => (current) => mergeList(current, spec, base[spec.table], rows[spec.table])))
  if (!saved || saved.workspaceId !== workspaceId) return
  for (const spec of TABLES) saved.base[spec.table] = baseFromRows(rows[spec.table], spec.key)
  writeSaved()
  setStatus({ phase: 'saved', lastSyncedAt: new Date().toISOString(), message: '' })
}

/**
 * Starts syncing this browser with a workspace.
 * - upload: this browser's board is copied into the (empty) workspace.
 * - empty: this browser starts with an empty board; the workspace stays empty.
 * - download: this browser shows the workspace's board instead of what it has now.
 * What the browser has now is first kept as a safety copy (Backup and restore → Put back).
 */
export async function startSync(workspace: Workspace, userId: string, mode: StartMode): Promise<string | null> {
  if (!adapter) return 'The board is not ready yet. Try again in a moment.'
  try { localStorage.setItem(BEFORE_RESTORE_KEY, JSON.stringify(createBackup())) } catch { /* no room for the safety copy: continue */ }
  let base = emptyBase()
  if (mode === 'download') {
    const rows = await fetchWorkspace(workspace.id)
    if ('error' in rows) return rows.error
    await applyLists(perList((spec) => () => [...rows[spec.table]].sort(spec.order)))
    base = Object.fromEntries(TABLES.map((spec) => [spec.table, baseFromRows(rows[spec.table], spec.key)])) as Base
  } else if (mode === 'empty') {
    await applyLists(perList(() => () => []))
  }
  saved = { workspaceId: workspace.id, workspaceName: workspace.name, userId, base }
  writeSaved()
  setStatus({ phase: 'saving', workspaceName: workspace.name, message: '' })
  await run('full')
  return status.phase === 'error' ? status.message : null
}

/** Stops syncing in this browser. The board stays as it is here; the workspace is not changed. */
export function stopSync() {
  saved = null
  queued = null
  window.clearTimeout(pushTimer)
  window.clearTimeout(retryTimer)
  try { localStorage.removeItem(SYNC_STATE_KEY) } catch { /* nothing to remove */ }
  setStatus({ phase: 'off', workspaceName: '', lastSyncedAt: '', message: '' })
}

/**
 * Connects the app's lists to the sync. `replace` must set a list without side effects (no activity entries),
 * because what it applies came from the database.
 */
export function useCloudSync(lists: SyncLists, replace: Adapter['replace']) {
  const latest = useRef(lists)
  const replaceRef = useRef(replace)
  useEffect(() => {
    latest.current = lists
    replaceRef.current = replace
    const waiting = commitWaiters
    commitWaiters = []
    waiting.forEach((resolve) => resolve())
    schedule('push')
  }, [lists, replace])

  useEffect(() => {
    adapter = { lists: () => latest.current, replace: (list, update) => replaceRef.current(list, update) }
    const full = () => schedule('full')
    const visible = () => { if (document.visibilityState === 'visible') full() }
    const poll = window.setInterval(full, POLL_EVERY)
    window.addEventListener('focus', full)
    window.addEventListener('online', full)
    document.addEventListener('visibilitychange', visible)
    full()
    return () => {
      adapter = null
      window.clearInterval(poll)
      window.removeEventListener('focus', full)
      window.removeEventListener('online', full)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
}
