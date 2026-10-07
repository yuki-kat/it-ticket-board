import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ExploreKey } from '../lib/route'
import '../styles/explore-page.css'

/** The parts of a ticket the Explore page lists. */
export type ExploreTicket = { id: string; title: string; status: string; severity: string; assignee: string; createdAt: string }
export type ExploreQueue<T extends ExploreTicket> = { key: ExploreKey; label: string; hint: string; tickets: T[] }

const sevClass = (severity: string) => severity.startsWith('P1') ? 'p1' : severity.startsWith('P2') ? 'p2' : severity.startsWith('P3') ? 'p3' : 'p4'
const byUrgency = (a: ExploreTicket, b: ExploreTicket) => a.severity.localeCompare(b.severity) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
// Below this width the three steps are shown one at a time.
const NARROW = '(max-width: 900px)'

type Props<T extends ExploreTicket> = {
  queues: ExploreQueue<T>[]
  tickets: T[]
  queue?: ExploreKey
  ticketId?: string
  onSelectQueue: (key?: ExploreKey) => void
  onSelectTicket: (id?: string) => void
  onOpenQueue: (key: ExploreKey) => void
  onOpenAll: () => void
  onOpenRecord: (id: string) => void
  onHome: () => void
  renderSummary: (ticket: T) => ReactNode
}

/**
 * Explore tickets, as a page: (1) choose a queue, (2) pick one of its tickets, (3) see that ticket's summary.
 * Side by side on a wide screen; one step at a time on a narrow one. Each step has its own address,
 * so the browser's Back button steps back.
 */
export default function ExplorePage<T extends ExploreTicket>({ queues, tickets, queue, ticketId, onSelectQueue, onSelectTicket, onOpenQueue, onOpenAll, onOpenRecord, onHome, renderSummary }: Props<T>) {
  const current = queues.find((item) => item.key === queue)
  const listed = current ? [...current.tickets].sort(byUrgency) : []
  const ticket = ticketId ? tickets.find((item) => item.id === ticketId) : undefined
  const step = ticket ? 3 : current ? 2 : 1

  // On a narrow screen the step just chosen replaces the previous one: start it at the top and move focus to its heading.
  const headings = useRef<Record<number, HTMLHeadingElement | null>>({})
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    if (!window.matchMedia(NARROW).matches) return
    window.scrollTo({ top: 0 })
    headings.current[step]?.focus({ preventScroll: true })
  }, [step])

  return <main className="main-content explore-page" data-step={step}>
    <nav className="explore-crumbs" aria-label="Breadcrumb"><button type="button" onClick={onHome}>Home</button><span aria-hidden="true">/</span><span aria-current="page">Explore tickets</span></nav>
    <header className="explore-heading">
      <div className="eyebrow">TICKET WORKSPACE</div>
      <h1>Explore tickets</h1>
      <p>Choose a queue, pick a ticket, and see its details. Your browser’s Back button steps back.</p>
    </header>

    <div className="explore-columns">
      <section className="explore-col explore-queues" aria-labelledby="explore-queues-title">
        <h2 id="explore-queues-title" tabIndex={-1} ref={(element) => { headings.current[1] = element }}><span>1</span> Queue</h2>
        <ul>{queues.map((item) => <li key={item.key}>
          <button type="button" data-queue={item.key} aria-current={item.key === queue ? 'true' : undefined} onClick={() => onSelectQueue(item.key)}>
            <span>{item.label}<small>{item.hint}</small></span><b>{item.tickets.length}</b>
          </button>
        </li>)}</ul>
        <button type="button" className="explore-all" onClick={onOpenAll}>All {tickets.length} tickets on the Tickets page <ArrowRight size={14} /></button>
      </section>

      <section className="explore-col explore-list" aria-labelledby="explore-list-title">
        {current ? <>
          <button type="button" className="explore-step-back" onClick={() => onSelectQueue(undefined)}><ArrowLeft size={14} /> Queues</button>
          <div className="explore-col-head">
            <h2 id="explore-list-title" tabIndex={-1} ref={(element) => { headings.current[2] = element }}><span>2</span> {current.label}</h2>
            <em>{listed.length} ticket{listed.length === 1 ? '' : 's'}</em>
          </div>
          {listed.length ? <ul>{listed.map((item) => <li key={item.id}>
            <button type="button" aria-current={item.id === ticketId ? 'true' : undefined} onClick={() => onSelectTicket(item.id)}>
              <i className={sevClass(item.severity)} />
              <span><b>{item.title || 'Untitled ticket'}</b><small>{[item.id, item.status, item.severity.split(/\s+/)[0], item.assignee || 'Unassigned'].join(' · ')}</small></span>
              <ArrowRight size={14} />
            </button>
          </li>)}</ul> : <p className="explore-empty">No tickets in this queue right now.</p>}
          <button type="button" className="explore-open-queue" onClick={() => onOpenQueue(current.key)}>Open this queue on the Tickets page <ArrowRight size={14} /></button>
        </> : <div className="explore-placeholder"><h2 id="explore-list-title"><span>2</span> Tickets</h2><p>Choose a queue to list its tickets.</p></div>}
      </section>

      <section className="explore-col explore-detail" aria-labelledby="explore-detail-title">
        {ticket ? <>
          <button type="button" className="explore-step-back" onClick={() => onSelectTicket(undefined)}><ArrowLeft size={14} /> {current?.label ?? 'Tickets'}</button>
          <div className="explore-col-head explore-detail-head">
            <div><div className="eyebrow">TICKET DETAILS</div><h2 id="explore-detail-title" tabIndex={-1} ref={(element) => { headings.current[3] = element }}>{ticket.id}</h2><p>{ticket.title}</p></div>
          </div>
          {renderSummary(ticket)}
          <div className="explore-detail-actions"><button type="button" className="primary-button" onClick={() => onOpenRecord(ticket.id)}>Open full record</button></div>
        </> : <div className="explore-placeholder"><h2 id="explore-detail-title"><span>3</span> Details</h2><p>{current ? 'Select a ticket to see its details.' : 'Details of the ticket you pick appear here.'}</p></div>}
      </section>
    </div>
  </main>
}
