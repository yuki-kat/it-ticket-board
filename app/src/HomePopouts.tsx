import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { debugLog } from './debug'
import './home-popouts.css'

type PopoutProps = {
  eyebrow: string
  title: string
  titleId: string
  description?: string
  onClose: () => void
  children?: ReactNode
  actions?: ReactNode
  overlayClassName?: string
  dialogClassName?: string
}

/**
 * What every popup does: move focus into it, close on Escape, and put focus back on whatever opened it.
 * Returns the ref to attach to the dialog element. `name` is what the debug log calls it.
 */
export function usePopoutBehaviour(onClose: () => void, name?: string) {
  const dialog = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.focus()
    if (name) debugLog('popup', `opened: ${name}`)
    // Listen in the capture phase so Escape closes this popup before anything else reacts to it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      if (name) debugLog('popup', `closed: ${name}`)
      opener?.focus()
    }
  }, [])

  return dialog
}

/**
 * The enlarged popup used on the Home page. Closes with the × button, a click outside the panel,
 * or Escape, and puts focus back on whatever opened it.
 */
export function TicketPopout({ eyebrow, title, titleId, description, onClose, children, actions, overlayClassName, dialogClassName }: PopoutProps) {
  const dialog = usePopoutBehaviour(onClose, title)

  return createPortal(
    <div className={overlayClassName ? `ticket-card-popout ${overlayClassName}` : 'ticket-card-popout'} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialog} className={dialogClassName ? `ticket-card-popout-dialog ${dialogClassName}` : 'ticket-card-popout-dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <button className="ticket-card-popout-close" type="button" aria-label="Close popup" onClick={onClose}>×</button>
        <div className="eyebrow">{eyebrow}</div>
        <h2 id={titleId}>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        {actions}
      </section>
    </div>,
    document.body,
  )
}

/** Close and "Open matching tickets" buttons at the bottom of a popup. */
export function PopoutActions({ onClose, onOpen, openLabel = 'Open matching tickets' }: { onClose: () => void; onOpen: () => void; openLabel?: string }) {
  return <div className="ticket-card-popout-actions">
    <button className="ticket-card-popout-cancel" type="button" onClick={onClose}>Close</button>
    <button className="ticket-card-popout-open" type="button" onClick={onOpen}>{openLabel}</button>
  </div>
}

export type ExploreQueue = { key: string; label: string; hint: string; count?: number; onChoose: () => void }

/** The "Explore tickets" launcher: pick a ticket queue and go straight to it. */
export function ExploreLauncher({ queues, onClose }: { queues: ExploreQueue[]; onClose: () => void }) {
  return <TicketPopout eyebrow="TICKET WORKSPACE" title="Choose a ticket queue" titleId="explore-queues-title" description="Open the queue that matches what you need to work on." onClose={onClose}
    actions={<div className="ticket-card-popout-actions"><button className="ticket-card-popout-cancel" type="button" onClick={onClose}>Close</button></div>}>
    <div className="explore-queue-grid">
      {queues.map((queue) => <button key={queue.key} data-queue={queue.key} className={queue.key === 'all' ? 'all-tickets' : undefined} type="button" onClick={queue.onChoose}>
        <span>{queue.label}<small>{queue.hint}</small></span>
        <b>{queue.count ?? '→'}</b>
      </button>)}
    </div>
  </TicketPopout>
}
