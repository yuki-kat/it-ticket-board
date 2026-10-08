import { useSyncExternalStore } from 'react'

// A small log of what the app is doing, for finding out why something happened.
// Turn it on with ?debug on the page address or Ctrl+Shift+D; it stays on until turned off.

export type DebugKind = 'click' | 'popup' | 'page' | 'error' | 'debug'
export type DebugEntry = { id: number; time: string; kind: DebugKind; detail: string }

const DEBUG_KEY = 'ops-kanban-debug-v1'
const MAX_ENTRIES = 80

function readEnabled(): boolean {
  try {
    if (/[?&]debug\b/.test(location.search)) { localStorage.setItem(DEBUG_KEY, '1'); return true }
    return localStorage.getItem(DEBUG_KEY) === '1'
  } catch { return false }
}

let enabled = readEnabled()
let entries: DebugEntry[] = []
let nextId = 0
let snapshot = { enabled, entries }
const listeners = new Set<() => void>()

function publish() {
  snapshot = { enabled, entries }
  listeners.forEach((listener) => listener())
}

const clock = () => new Date().toLocaleTimeString([], { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')

export function debugLog(kind: DebugKind, detail: string) {
  if (!enabled) return
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), { id: nextId++, time: clock(), kind, detail }]
  console.debug(`[debug] ${kind}: ${detail}`)
  publish()
}

export function setDebugEnabled(on: boolean) {
  enabled = on
  try { localStorage.setItem(DEBUG_KEY, on ? '1' : '0') } catch { /* it just won't be remembered */ }
  if (on) debugLog('debug', 'on (Ctrl+Shift+D toggles)')
  publish()
}

export const isDebugEnabled = () => enabled

export function clearDebugLog() {
  entries = []
  publish()
}

export function useDebugState() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => snapshot)
}
