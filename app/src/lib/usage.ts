import { useEffect, useState } from 'react'

/**
 * On-device usage learning for the Quick actions page.
 *
 * Records which app command was used and on which ticket (never any ticket text), then learns two things:
 *  - frecency: every use counts, recent uses count more (a use loses half its weight every HALF_LIFE_DAYS);
 *  - next step: a first-order Markov chain, i.e. "after command A, how often was B the very next command".
 * Everything stays in this browser's localStorage, so nothing leaves the device.
 */
export type UsageEvent = { c: string; t: number; k?: string } // command id, time (ms), ticket id
export type RankedCommand = { command: string; score: number; uses: number; lastUsed: number }
export type NextStep = { command: string; times: number; outOf: number }

const KEY = 'it-ticket-kanban-usage-v1'
const PAUSED_KEY = 'it-ticket-kanban-usage-paused-v1'
const CHANGE_EVENT = 'it-ticket-usage-change'
const MAX_EVENTS = 2000
export const HALF_LIFE_DAYS = 7
// Two commands further apart than this are separate pieces of work, not "A then B".
const NEXT_STEP_GAP_MS = 30 * 60_000
// A double click, or a handler that fires twice for one click, is a single use.
const REPEAT_MS = 1500

function readEvents(): UsageEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(value) ? value.filter((event) => event && typeof event.c === 'string' && typeof event.t === 'number') : []
  } catch {
    return []
  }
}

export function isLearningPaused(): boolean {
  try { return localStorage.getItem(PAUSED_KEY) === '1' } catch { return false }
}

const announce = () => window.dispatchEvent(new Event(CHANGE_EVENT))

export function recordUse(command: string, ticketId?: string, now = Date.now()) {
  if (isLearningPaused()) return
  const events = readEvents()
  const last = events[events.length - 1]
  if (last && last.c === command && last.k === ticketId && now - last.t < REPEAT_MS) return
  events.push(ticketId ? { c: command, t: now, k: ticketId } : { c: command, t: now })
  try { localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS))) } catch { return } // storage full or blocked: learning stops quietly
  announce()
}

export function setLearningPaused(paused: boolean) {
  try {
    if (paused) localStorage.setItem(PAUSED_KEY, '1')
    else localStorage.removeItem(PAUSED_KEY)
  } catch { /* blocked storage: nothing to change */ }
  announce()
}

export function clearUsage() {
  try { localStorage.removeItem(KEY) } catch { /* blocked storage: nothing stored */ }
  announce()
}

export function rankByFrecency(events: UsageEvent[], now = Date.now()): RankedCommand[] {
  const halfLife = HALF_LIFE_DAYS * 86_400_000
  const ranked = new Map<string, RankedCommand>()
  for (const event of events) {
    const entry = ranked.get(event.c) || { command: event.c, score: 0, uses: 0, lastUsed: 0 }
    entry.score += Math.pow(0.5, Math.max(0, now - event.t) / halfLife)
    entry.uses += 1
    entry.lastUsed = Math.max(entry.lastUsed, event.t)
    ranked.set(event.c, entry)
  }
  return [...ranked.values()].sort((a, b) => b.score - a.score || b.lastUsed - a.lastUsed)
}

export function predictNext(events: UsageEvent[], after: string): NextStep[] {
  const counts = new Map<string, number>()
  let total = 0
  for (let i = 0; i < events.length - 1; i++) {
    const current = events[i], next = events[i + 1]
    if (current.c !== after || next.c === after || next.t - current.t > NEXT_STEP_GAP_MS) continue
    counts.set(next.c, (counts.get(next.c) || 0) + 1)
    total++
  }
  return [...counts].map(([command, times]) => ({ command, times, outOf: total })).sort((a, b) => b.times - a.times)
}

export function lastTicketWorkedOn(events: UsageEvent[], exists: (id: string) => boolean): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const id = events[i].k
    if (id && exists(id)) return id
  }
  return ''
}

/** The recorded events and pause state, kept current as commands are used anywhere in the app or in another tab. */
export function useUsage() {
  const [state, setState] = useState(() => ({ events: readEvents(), paused: isLearningPaused() }))
  useEffect(() => {
    const update = () => setState({ events: readEvents(), paused: isLearningPaused() })
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', update)
    return () => { window.removeEventListener(CHANGE_EVENT, update); window.removeEventListener('storage', update) }
  }, [])
  return state
}
