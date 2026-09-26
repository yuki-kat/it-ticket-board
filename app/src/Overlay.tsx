import { useEffect, useRef, type ReactNode } from 'react'
import { debugLog } from './debug'
import './overlay.css'

// Every open dialog is listed here so that Escape closes the one on top.
const openOverlays: { close: () => void }[] = []
let listening = false

function closeTopOverlayOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  openOverlays.at(-1)?.close()
}

/**
 * The dark backdrop and container for a dialog. Clicking the backdrop, pressing Escape, or using the round
 * × in the corner of the screen closes it, so a tall dialog can always be closed without scrolling.
 */
export default function Overlay({ className, onClose, children }: { className?: string; onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose)
  close.current = onClose
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const entry = { close: () => close.current() }
    const name = element.current?.querySelector('h2, h3')?.textContent?.trim().slice(0, 50) || 'dialog'
    openOverlays.push(entry)
    debugLog('popup', `opened: ${name}`)
    if (!listening) { document.addEventListener('keydown', closeTopOverlayOnEscape); listening = true }
    return () => { openOverlays.splice(openOverlays.indexOf(entry), 1); debugLog('popup', `closed: ${name}`) }
  }, [])

  return <div ref={element} className={className ? `overlay ${className}` : 'overlay'} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    {children}
    <button type="button" className="overlay-corner-close" aria-label="Close popup" title="Close popup" onClick={onClose}>×</button>
  </div>
}
