import { useEffect, useRef } from 'react'
import { clearDebugLog, debugLog, isDebugEnabled, setDebugEnabled, useDebugState } from '../lib/debug'
import '../styles/debug-panel.css'

/** Short description of an element for the log, like button.home-kpi "Open tickets". */
function describe(element: Element): string {
  const classes = typeof element.className === 'string' && element.className.trim() ? '.' + element.className.trim().split(/\s+/).join('.') : ''
  const text = (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
  return `${element.tagName.toLowerCase()}${classes}${text ? ` "${text}"` : ''}`
}

/** Watches clicks and errors while the log is on, and shows the log in the bottom-left corner. */
export default function DebugPanel() {
  const { enabled, entries } = useDebugState()
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isDebugEnabled() || !(event.target instanceof Element) || event.target.closest('.debug-panel')) return
      debugLog('click', `${describe(event.target)}${event.isTrusted ? '' : ' (scripted)'}`)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); setDebugEnabled(!isDebugEnabled()) }
    }
    const onError = (event: ErrorEvent) => debugLog('error', `${event.message} (${(event.filename || '').split('/').pop()}:${event.lineno}:${event.colno})`)
    const onRejection = (event: PromiseRejectionEvent) => debugLog('error', `Unhandled promise: ${event.reason?.message || event.reason}`)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [entries])
  if (!enabled) return null
  return <section className="debug-panel" aria-label="Debug log">
    <header><strong>Debug log</strong><button type="button" onClick={clearDebugLog}>Clear</button><button type="button" onClick={() => setDebugEnabled(false)}>Turn off</button></header>
    <ol ref={list}>{entries.map((entry) => <li key={entry.id} className={entry.kind}><time>{entry.time}</time><b>{entry.kind}</b><span>{entry.detail}</span></li>)}</ol>
  </section>
}
