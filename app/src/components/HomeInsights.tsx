import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { TicketPopout, usePopoutBehaviour } from './HomePopouts'
import '../styles/home-insights.css'
import '../styles/home-arrange.css'

/** The parts of a ticket that the insight cards need. */
export type InsightTicket = { id: string; title: string; status: string; severity: string; assignee: string; createdAt: string }
export type QueueFilter = 'all' | 'active' | 'resolved' | 'high-priority' | 'overdue' | 'escalated' | 'escalation-due' | 'unassigned' | 'waiting'
export type InsightKey = 'status' | 'priority' | 'intake' | 'recent' | 'sla' | 'escalation' | 'assignment' | 'resolution'
/** Cards that open the detail popup (the "Recently created" card is a list of tickets that open directly). */
export type DetailKey = Exclude<InsightKey, 'recent'>

export const INSIGHT_KEYS: InsightKey[] = ['status', 'priority', 'intake', 'recent', 'sla', 'escalation', 'assignment', 'resolution']
export const EXTRA_INSIGHT_KEYS = ['sla', 'escalation', 'assignment', 'resolution'] as const

export type InsightContext = {
  tickets: InsightTicket[]
  now: number
  statuses: readonly string[]
  counts: { open: number; closed: number; overdue: number; escalated: number; escalationDue: number; unassigned: number }
  breachedIds: ReadonlySet<string>
  showTickets: (filter: QueueFilter) => void
  openTicket: (id: string) => void
}

const isOpen = (ticket: InsightTicket) => ticket.status !== 'Resolved'
const sevClass = (severity: string) => severity.startsWith('P1') ? 'p1' : severity.startsWith('P2') ? 'p2' : severity.startsWith('P3') ? 'p3' : 'p4'

const CARD_INFO: Record<InsightKey, { title: string; subtitle: (ctx: InsightContext) => string }> = {
  status: { title: 'Tickets by state', subtitle: (ctx) => `All ${ctx.tickets.length} tickets` },
  priority: { title: 'Open tickets by priority', subtitle: () => 'Current priority mix' },
  intake: { title: 'Ticket intake', subtitle: () => 'Tickets created each hour, last 24 hours' },
  recent: { title: 'Recently created', subtitle: () => 'Open a ticket to see its details' },
  sla: { title: 'SLA health', subtitle: () => 'Open tickets still within their resolution target.' },
  escalation: { title: 'Escalation workload', subtitle: () => 'Escalated tickets requiring coordination.' },
  assignment: { title: 'Assignment coverage', subtitle: () => 'Open tickets with a named owner.' },
  resolution: { title: 'Resolution rate', subtitle: () => 'Resolved tickets as a share of all recorded tickets.' },
}

/** A row in a card that can be picked in the detail popup to list its tickets. */
type Segments = { selected: string | null; onSelect: (key: string) => void }
function segmentAttributes(segments: Segments | undefined, key: string, label: string) {
  if (!segments) return {}
  const select = () => segments.onSelect(key)
  return {
    role: 'button',
    tabIndex: 0,
    'aria-pressed': segments.selected === key,
    'aria-label': `${label}: show tickets`,
    onClick: select,
    onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } },
  }
}

type CardProps = { ctx: InsightContext; onOpen?: () => void; segments?: Segments }

/** The invisible button laid over a card that opens its detail popup. */
function OpenTarget({ title, onOpen }: { title: string; onOpen?: () => void }) {
  return onOpen ? <button type="button" className="insight-click-target" aria-label={`Open ${title} details`} onClick={onOpen} /> : null
}

function CardHeading({ kind, ctx, badge }: { kind: InsightKey; ctx: InsightContext; badge: ReactNode }) {
  const info = CARD_INFO[kind]
  return <div className="home-chart-heading"><div><h3>{info.title}</h3><p>{info.subtitle(ctx)}</p></div><span className="home-chart-badge">{badge}</span></div>
}

function StateCard({ ctx, onOpen, segments }: CardProps) {
  const data = ctx.statuses.map((status) => ({ status, count: ctx.tickets.filter((ticket) => ticket.status === status).length }))
  const max = Math.max(1, ...data.map((item) => item.count))
  return <article className="home-chart-card">
    <CardHeading kind="status" ctx={ctx} badge="STATUS" />
    <div className="home-status-bars">{data.map((item) => <div className={'home-status-row' + (segments ? ' insight-segment' : '')} key={item.status} {...segmentAttributes(segments, item.status, item.status)}><span>{item.status}</span><div className="home-status-track"><div className={`home-status-fill ${item.status === 'Resolved' ? 'resolved' : item.status === 'Escalated' ? 'escalated' : ''}`} style={{ width: `${item.count / max * 100}%` }} /></div><b>{item.count}</b></div>)}</div>
    <OpenTarget title={CARD_INFO.status.title} onOpen={onOpen} />
  </article>
}

const PRIORITY_COLORS = ['#db6763', '#e4a551', '#4b91a2', '#a0aeb8']
function PriorityCard({ ctx, onOpen, segments }: CardProps) {
  const open = ctx.tickets.filter(isOpen)
  const data = ['P1', 'P2', 'P3', 'P4'].map((priority, index) => ({ priority, count: open.filter((ticket) => ticket.severity.startsWith(priority)).length, color: PRIORITY_COLORS[index] }))
  const circumference = 2 * Math.PI * 65
  let offset = 0
  const rings = data.map((item) => {
    const length = open.length ? item.count / open.length * circumference : 0
    const ring = { ...item, length, offset }
    offset += length
    return ring
  })
  return <article className="home-chart-card">
    <CardHeading kind="priority" ctx={ctx} badge="PRIORITY" />
    <div className="home-priority-content">
      <div className="home-donut">
        <svg viewBox="0 0 180 180" role="img" aria-label={`Open ticket priorities: ${data.map((item) => `${item.priority} ${item.count}`).join(', ')}`}>
          <circle cx="90" cy="90" r="65" fill="none" stroke="#e9eef1" strokeWidth="22" />
          {/* In the popup the arcs can be clicked too; the legend rows beside them are the keyboard route. */}
          {rings.filter((ring) => ring.count).map((ring) => <circle key={ring.priority} className={segments ? 'insight-arc' + (segments.selected === ring.priority ? ' selected' : '') : undefined} data-priority={ring.priority} onClick={segments ? () => segments.onSelect(ring.priority) : undefined} cx="90" cy="90" r="65" fill="none" stroke={ring.color} strokeWidth="22" strokeDasharray={`${ring.length} ${circumference - ring.length}`} strokeDashoffset={-ring.offset} transform="rotate(-90 90 90)" />)}
        </svg>
        <div><strong>{open.length}</strong><span>open</span></div>
      </div>
      <div className="home-priority-legend">{data.map((item) => <div key={item.priority} className={segments ? 'insight-segment' : undefined} {...segmentAttributes(segments, item.priority, `${item.priority} open tickets`)}><i style={{ background: item.color }} /><span>{item.priority}</span><b>{item.count}</b></div>)}</div>
    </div>
    <OpenTarget title={CARD_INFO.priority.title} onOpen={onOpen} />
  </article>
}

/** The start of each of the last 24 hours, oldest first. Shared by the intake chart and its popup. */
function intakeHours(now: number) {
  const hourStart = new Date(now)
  hourStart.setMinutes(0, 0, 0)
  hourStart.setHours(hourStart.getHours() - 23)
  return Array.from({ length: 24 }, (_, index) => hourStart.getTime() + index * 60 * 60_000)
}
const inHour = (ticket: InsightTicket, start: number) => { const created = new Date(ticket.createdAt).getTime(); return created >= start && created < start + 60 * 60_000 }
const hourLabel = (value: number) => new Intl.DateTimeFormat('en', { hour: 'numeric' }).format(new Date(value))

function IntakeCard({ ctx, onOpen, segments }: CardProps) {
  const buckets = intakeHours(ctx.now).map((start) => ({ start, count: ctx.tickets.filter((ticket) => inHour(ticket, start)).length }))
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const points = buckets.map((bucket, index) => ({ x: 34 + index * 26, y: 174 - bucket.count / max * 125 }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = `${line} L ${points.at(-1)?.x || 632} 174 L 34 174 Z`
  return <article className="home-chart-card home-trend-card">
    <CardHeading kind="intake" ctx={ctx} badge="24 HOURS" />
    <div className="home-trend-chart">
      <svg viewBox="0 0 680 205" role="img" aria-label={`Ticket intake in the last 24 hours: ${buckets.reduce((sum, bucket) => sum + bucket.count, 0)} tickets`} preserveAspectRatio="none">
        <line x1="34" y1="174" x2="658" y2="174" stroke="#d9e3e8" /><line x1="34" y1="111" x2="658" y2="111" stroke="#edf1f3" /><line x1="34" y1="49" x2="658" y2="49" stroke="#edf1f3" />
        <path d={area} fill="#e7f2f5" />
        <path d={line} fill="none" stroke="#2f7186" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => buckets[index].count > 0 && <circle key={index} cx={point.x} cy={point.y} r="3.5" fill="#2f7186" stroke="white" strokeWidth="2" />)}
        {/* In the popup, each hour that has tickets is a column that lists them. */}
        {segments && buckets.map((bucket, index) => bucket.count > 0 && <rect key={bucket.start} className="insight-hour" x={points[index].x - 13} y="40" width="26" height="134" rx="4" {...segmentAttributes(segments, String(bucket.start), `${hourLabel(bucket.start)}, ${bucket.count} ticket${bucket.count === 1 ? '' : 's'}`)} />)}
        <text x="5" y="53">{max}</text><text x="12" y="178">0</text><text x="34" y="199">{hourLabel(buckets[0].start)}</text><text x="315" y="199">{hourLabel(buckets[11].start)}</text><text x="607" y="199">Now</text>
      </svg>
    </div>
    <OpenTarget title={CARD_INFO.intake.title} onOpen={onOpen} />
  </article>
}

function RecentCard({ ctx }: CardProps) {
  const recent = [...ctx.tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  return <article className="home-chart-card home-recent-card">
    <div className="home-chart-heading"><div><h3>{CARD_INFO.recent.title}</h3><p>{CARD_INFO.recent.subtitle(ctx)}</p></div><button onClick={() => ctx.showTickets('all')}>See all <ArrowRight size={14} /></button></div>
    <div className="home-recent-list">{recent.length ? recent.map((ticket) => <button key={ticket.id} onClick={() => ctx.openTicket(ticket.id)}><span className={`home-recent-priority ${sevClass(ticket.severity)}`} /> <span className="home-recent-copy"><b>{ticket.title}</b><small>{ticket.id} · {ticket.status}</small></span><ArrowRight size={14} /></button>) : <p>No tickets yet. Create a task to start tracking work.</p>}</div>
  </article>
}

/** The four extra cards: a headline number, a bar showing the share, and a note on what to do. */
function extraValues(kind: Exclude<DetailKey, 'status' | 'priority' | 'intake'>, ctx: InsightContext) {
  const { open, closed, overdue, escalated, escalationDue, unassigned } = ctx.counts
  const total = open + closed
  if (kind === 'sla') return { value: Math.max(0, open - overdue), total: open, summary: `${overdue} currently past SLA`, tone: overdue ? 'amber' : 'green', left: 'Within target', right: `${open} open`, note: overdue ? 'Review breached tickets and confirm an owner and next action.' : 'All open tickets are currently within their resolution target.', badge: 'SLA' }
  if (kind === 'escalation') return { value: escalated, total: open, summary: `${escalationDue} additional tickets due for escalation`, tone: escalated || escalationDue ? 'coral' : 'green', left: 'Escalated', right: `${open} open`, note: escalated || escalationDue ? 'Coordinate the active escalation queue before the next threshold.' : 'No tickets currently require escalation coordination.', badge: 'ESCALATION' }
  if (kind === 'assignment') return { value: Math.max(0, open - unassigned), total: open, summary: `${unassigned} open tickets are unassigned`, tone: unassigned ? 'amber' : 'green', left: 'Assigned', right: `${open} open`, note: unassigned ? 'Assign ownership to reduce queue delay and SLA risk.' : 'Every open ticket currently has an owner.', badge: 'OWNERSHIP' }
  return { value: closed, total, summary: `${closed} resolved of ${total} total tickets`, tone: 'green', left: 'Resolved', right: `${total} total`, note: 'This is a current workspace ratio and will change as tickets are added or resolved.', badge: 'RESOLUTION' }
}

function ExtraCard({ kind, ctx, onOpen }: CardProps & { kind: 'sla' | 'escalation' | 'assignment' | 'resolution' }) {
  const values = extraValues(kind, ctx)
  const percent = Math.max(0, Math.min(100, Math.round(values.value / Math.max(1, values.total) * 100)))
  return <article className="home-chart-card extended-insight-card" data-extra-insight={kind}>
    <CardHeading kind={kind} ctx={ctx} badge={values.badge} />
    <div className="extended-insight-body">
      <div className="extended-insight-metric"><strong>{values.value}</strong><span>{values.summary}</span></div>
      <div className={`extended-insight-track ${values.tone}`}><i style={{ width: `${percent}%` }} /></div>
      <div className="extended-insight-legend"><span>{values.left}</span><b>{percent}%</b><span>{values.right}</span></div>
      <div className="extended-insight-note">{values.note}</div>
    </div>
    <OpenTarget title={CARD_INFO[kind].title} onOpen={onOpen} />
  </article>
}

/** One card of the Operations insights grid. Without `onOpen` it has no click target (used inside the popup). */
export function InsightCard({ kind, ...props }: CardProps & { kind: InsightKey }) {
  switch (kind) {
    case 'status': return <StateCard {...props} />
    case 'priority': return <PriorityCard {...props} />
    case 'intake': return <IntakeCard {...props} />
    case 'recent': return <RecentCard {...props} />
    default: return <ExtraCard kind={kind} {...props} />
  }
}

// ---------------------------------------------------------------------------------------------
// Detail popup

type Segment = { label: string; queue: QueueFilter; match: (ticket: InsightTicket) => boolean }
type DetailConfig = { queue: QueueFilter; hint?: string; segmentFor?: (key: string) => Segment; whole?: Segment }

const QUEUE_LABELS: Record<QueueFilter, string> = {
  all: 'Open all tickets', active: 'Open active tickets', 'high-priority': 'Open P1 / P2 tickets', overdue: 'Open past-SLA tickets', escalated: 'Open escalated tickets',
  'escalation-due': 'Open escalation-due tickets', unassigned: 'Open unassigned tickets', waiting: 'Open waiting-on-user tickets', resolved: 'Open closed tickets',
}

function detailConfig(kind: DetailKey, ctx: InsightContext): DetailConfig {
  switch (kind) {
    case 'status': return {
      queue: 'all', hint: 'Select a state to list its tickets.',
      segmentFor: (status) => ({ label: status, queue: ({ 'Waiting on User': 'waiting', Escalated: 'escalated', Resolved: 'resolved' } as Record<string, QueueFilter>)[status] ?? 'active', match: (ticket) => ticket.status === status }),
    }
    case 'priority': return {
      queue: 'active', hint: 'Select a priority to list its open tickets.',
      segmentFor: (priority) => ({ label: `${priority} open tickets`, queue: /^P[12]$/.test(priority) ? 'high-priority' : 'active', match: (ticket) => isOpen(ticket) && ticket.severity.startsWith(priority) }),
    }
    case 'intake': return {
      queue: 'all', hint: 'Select an hour to list its tickets. Select it again to show all 24 hours.',
      whole: { label: 'Created in the last 24 hours', queue: 'all', match: (ticket) => ctx.now - new Date(ticket.createdAt).getTime() <= 864e5 },
      segmentFor: (start) => ({ label: `Created ${hourLabel(Number(start))} – ${hourLabel(Number(start) + 60 * 60_000)}`, queue: 'all', match: (ticket) => inHour(ticket, Number(start)) }),
    }
    case 'sla': return { queue: 'overdue', whole: { label: 'Past resolution SLA', queue: 'overdue', match: (ticket) => ctx.breachedIds.has(ticket.id) } }
    case 'escalation': return { queue: 'escalated', whole: { label: 'Escalated open tickets', queue: 'escalated', match: (ticket) => isOpen(ticket) && ticket.status === 'Escalated' } }
    case 'assignment': return { queue: 'unassigned', whole: { label: 'Unassigned open tickets', queue: 'unassigned', match: (ticket) => isOpen(ticket) && !ticket.assignee.trim() } }
    case 'resolution': return { queue: 'resolved', whole: { label: 'Resolved tickets', queue: 'resolved', match: (ticket) => ticket.status === 'Resolved' } }
  }
}

const MAX_LISTED = 6

function TicketList({ segment, ctx, onOpenTicket }: { segment: Segment; ctx: InsightContext; onOpenTicket: (id: string) => void }) {
  const matches = ctx.tickets.filter(segment.match).sort((a, b) => a.severity.localeCompare(b.severity) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return <>
    <div className="insight-detail-head"><strong>{segment.label}</strong><span>{matches.length} ticket{matches.length === 1 ? '' : 's'}</span></div>
    {matches.length ? <ul>{matches.slice(0, MAX_LISTED).map((ticket) => <li key={ticket.id}>
      <button type="button" onClick={() => onOpenTicket(ticket.id)}>
        <i className={sevClass(ticket.severity)} />
        <span><b>{ticket.title || 'Untitled ticket'}</b><small>{[ticket.id, ticket.status, ticket.severity.split(/\s+/)[0], ticket.assignee || 'Unassigned'].filter(Boolean).join(' · ')}</small></span>
        <em>Open</em>
      </button>
    </li>)}</ul> : <p className="insight-detail-empty">No tickets match right now.</p>}
    {matches.length > MAX_LISTED && <p className="insight-detail-more">+{matches.length - MAX_LISTED} more. Use “{QUEUE_LABELS[segment.queue]}” to see the full list.</p>}
  </>
}

/** The enlarged popup for a card: the card itself, a list of the tickets behind it, and a button to open that queue. */
export function InsightDetail({ kind, ctx, onClose, onOpenQueue, onOpenTicket, onArrange }: { kind: DetailKey; ctx: InsightContext; onClose: () => void; onOpenQueue: (filter: QueueFilter) => void; onOpenTicket: (id: string) => void; onArrange: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const config = detailConfig(kind, ctx)
  const info = CARD_INFO[kind]
  const segment = selected && config.segmentFor ? config.segmentFor(selected) : config.whole
  const queue = segment?.queue ?? config.queue
  // A card with a whole-card list (intake) goes back to it when the selected segment is picked again.
  const select = (key: string) => setSelected((current) => current === key && config.whole ? null : key)
  return <TicketPopout overlayClassName="insight-detail-overlay" dialogClassName="insight-detail-dialog" eyebrow="OPERATIONS INSIGHTS" title={info.title} titleId="insight-detail-title" description={info.subtitle(ctx)} onClose={onClose}
    actions={<div className="ticket-card-popout-actions">
      <button className="insight-detail-arrange" type="button" onClick={onArrange}>Arrange card</button>
      <button className="ticket-card-popout-cancel" type="button" onClick={onClose}>Close</button>
      <button className="ticket-card-popout-open" type="button" onClick={() => onOpenQueue(queue)}>{QUEUE_LABELS[queue]}</button>
    </div>}>
    <div className="ticket-card-popout-preview insight-detail-preview">
      <InsightCard kind={kind} ctx={ctx} segments={config.segmentFor ? { selected, onSelect: select } : undefined} />
      {config.hint && <p className="insight-detail-hint">{config.hint}</p>}
    </div>
    <div className="insight-detail-tickets" aria-live="polite">{segment && <TicketList segment={segment} ctx={ctx} onOpenTicket={onOpenTicket} />}</div>
  </TicketPopout>
}

// ---------------------------------------------------------------------------------------------
// Order of the cards, and the "Arrange card" popup

export const INSIGHT_ORDER_KEY = 'ops-kanban-home-insight-order-v1'
export type MoveDirection = 'left' | 'right' | 'up' | 'down' | 'first' | 'last'

// The order is saved the way the compiled page saved it (a card's title, or its short name for the
// four extra cards), so a browser that used the page keeps its arrangement.
const identity = (key: InsightKey): string => (EXTRA_INSIGHT_KEYS as readonly string[]).includes(key) ? key : CARD_INFO[key].title

/** The saved order of all eight cards. Unknown entries are ignored and cards missing from it go last. */
export function loadInsightOrder(): InsightKey[] {
  let saved: unknown = []
  try { saved = JSON.parse(localStorage.getItem(INSIGHT_ORDER_KEY) || '[]') } catch { /* use the default order */ }
  const byIdentity = new Map(INSIGHT_KEYS.map((key) => [identity(key), key]))
  const order: InsightKey[] = []
  if (Array.isArray(saved)) for (const item of saved) {
    const key = byIdentity.get(String(item))
    if (key && !order.includes(key)) order.push(key)
  }
  return [...order, ...INSIGHT_KEYS.filter((key) => !order.includes(key))]
}

export function saveInsightOrder(order: InsightKey[]) {
  localStorage.setItem(INSIGHT_ORDER_KEY, JSON.stringify(order.map(identity)))
}

/** Which moves make sense for the card at `index` among `count` visible cards laid out in `columns` columns. */
export function availableMoves(index: number, count: number, columns: number): Record<MoveDirection, boolean> {
  return { left: index > 0, right: index < count - 1, up: index - columns >= 0, down: index + columns < count, first: index > 0, last: index < count - 1 }
}

/**
 * The new order of all cards after moving `key` among the `visible` ones, or null if it cannot move.
 * Cards that are switched off keep their place in the order for when they come back.
 */
export function moveInsight(order: InsightKey[], visible: InsightKey[], key: InsightKey, direction: MoveDirection, columns: number): InsightKey[] | null {
  const index = visible.indexOf(key)
  if (index < 0) return null
  const target = { left: index - 1, right: index + 1, up: index - columns, down: index + columns, first: 0, last: visible.length - 1 }[direction]
  const next = Math.max(0, Math.min(visible.length - 1, target))
  if (next === index) return null
  const rest = order.filter((item) => item !== key)
  const at = rest.indexOf(visible[next])
  rest.splice(next < index ? at : at + 1, 0, key)
  return rest
}

const MOVE_BUTTONS: { direction: MoveDirection; content: ReactNode }[] = [
  { direction: 'left', content: <><span>←</span> Left</> },
  { direction: 'right', content: <>Right <span>→</span></> },
  { direction: 'up', content: <><span>↑</span> Up</> },
  { direction: 'down', content: <><span>↓</span> Down</> },
  { direction: 'first', content: <><span>⇤</span> Move first</> },
  { direction: 'last', content: <>Move last <span>⇥</span></> },
]

/** The popup that asks where a card should go (left, right, up, down, first or last). */
export function ArrangeInsight({ kind, ctx, visible, columns, onMove, onClose }: { kind: InsightKey; ctx: InsightContext; visible: InsightKey[]; columns: number; onMove: (direction: MoveDirection) => void; onClose: () => void }) {
  const dialog = usePopoutBehaviour(onClose, `Arrange: ${CARD_INFO[kind].title}`)
  const available = availableMoves(visible.indexOf(kind), visible.length, columns)
  return createPortal(
    <div className="insight-move-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialog} className="insight-move-page" role="dialog" aria-modal="true" aria-labelledby="insight-move-title" tabIndex={-1}>
        <header>
          <div><div className="eyebrow">ARRANGE OPERATIONS INSIGHTS</div><h2 id="insight-move-title">{CARD_INFO[kind].title}</h2><p>Choose where you would like this card to move.</p></div>
          <button className="insight-move-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="insight-move-preview"><InsightCard kind={kind} ctx={ctx} /></div>
        <div className="insight-move-question">Where would you like to move this card?</div>
        <div className="insight-move-options">
          {MOVE_BUTTONS.map(({ direction, content }) => <button key={direction} type="button" data-move={direction} disabled={!available[direction]} onClick={() => onMove(direction)}>{content}</button>)}
        </div>
        <footer><button type="button" onClick={onClose}>Cancel</button></footer>
      </section>
    </div>,
    document.body,
  )
}
