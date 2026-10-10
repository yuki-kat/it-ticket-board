export type PauseReason = 'manual' | 'waiting-on-user' | 'resolved'

export interface PauseState {
  pausedAt: number | null
  pausedMs: number
  reason?: PauseReason
  lastStatus?: string
}

export interface PauseChange {
  ticketId: string
  paused: boolean
  pausedForMs: number
  reason: PauseReason
  status?: string
}

// Statuses that hold the SLA clock automatically, as ServiceNow does with pause conditions
// (On Hold - Awaiting Caller, and Resolved until the ticket is closed or reopened).
const AUTO_PAUSE: Record<string, PauseReason> = { 'Waiting on User': 'waiting-on-user', Resolved: 'resolved' }

// Browser-only pause state, keyed by ticket, until the server SLA API is wired up.
const PAUSE_KEY = 'it-ticket-sla-pause'
export const PAUSE_EVENT = 'sla-pause-change'

function loadPauses(): Record<string, PauseState> {
  try {
    return JSON.parse(localStorage.getItem(PAUSE_KEY) || '{}')
  } catch {
    return {}
  }
}

let pauses = loadPauses()

function save(ticketId: string, state: PauseState) {
  pauses = { ...pauses, [ticketId]: state }
  try {
    localStorage.setItem(PAUSE_KEY, JSON.stringify(pauses))
  } catch {
    // Storage blocked: the pause still applies until the page reloads.
  }
}

export function readPause(ticketId: string): PauseState {
  return pauses[ticketId] || { pausedAt: null, pausedMs: 0 }
}

export function pausedMsFor(ticketId: string, now: number) {
  const state = readPause(ticketId)
  return state.pausedMs + (state.pausedAt !== null ? Math.max(0, now - state.pausedAt) : 0)
}

function setPaused(ticketId: string, paused: boolean, reason: PauseReason, status?: string) {
  const state = readPause(ticketId)
  if ((state.pausedAt !== null) === paused) return
  const at = Date.now()
  const pausedForMs = paused ? 0 : at - (state.pausedAt as number)
  save(ticketId, paused
    ? { ...state, pausedAt: at, reason }
    : { ...state, pausedAt: null, pausedMs: state.pausedMs + pausedForMs, reason: undefined })
  window.dispatchEvent(new CustomEvent<PauseChange>(PAUSE_EVENT, { detail: { ticketId, paused, pausedForMs, reason, status } }))
}

export function togglePause(ticketId: string) {
  setPaused(ticketId, readPause(ticketId).pausedAt === null, 'manual')
}

// Acts only on status changes, so a manual resume while a ticket is still waiting is not undone.
export function syncStatusPause(ticketId: string, status: string) {
  const state = readPause(ticketId)
  if (state.lastStatus === status) return
  save(ticketId, { ...state, lastStatus: status })
  const autoReason = AUTO_PAUSE[status]
  const pausedByStatus = state.pausedAt !== null && state.reason !== undefined && state.reason !== 'manual'
  if (autoReason) {
    if (state.pausedAt === null) setPaused(ticketId, true, autoReason, status)
    else if (pausedByStatus && state.reason !== autoReason) save(ticketId, { ...readPause(ticketId), reason: autoReason })
  } else if (pausedByStatus) {
    setPaused(ticketId, false, state.reason as PauseReason, status)
  }
}

export function onPauseChange(listener: (change: PauseChange | null) => void) {
  const local = (e: Event) => listener((e as CustomEvent<PauseChange>).detail)
  const otherTab = (e: StorageEvent) => {
    if (e.key !== PAUSE_KEY) return
    pauses = loadPauses()
    listener(null)
  }
  window.addEventListener(PAUSE_EVENT, local)
  window.addEventListener('storage', otherTab)
  return () => {
    window.removeEventListener(PAUSE_EVENT, local)
    window.removeEventListener('storage', otherTab)
  }
}
