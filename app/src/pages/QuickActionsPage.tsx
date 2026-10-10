import { useState, type ReactNode } from 'react'
import { Pause, Play, Trash2, Zap } from 'lucide-react'
import { clearUsage, HALF_LIFE_DAYS, lastTicketWorkedOn, predictNext, rankByFrecency, recordUse, setLearningPaused, useUsage } from '../lib/usage'
import '../styles/quick-actions.css'

export type QuickCommand = { id: string; label: string; group: string; icon: ReactNode; needsTicket: boolean; run: (ticketId: string) => void }

const TOP_COUNT = 8
const NEXT_COUNT = 4

function ago(time: number, now: number) {
  const minutes = Math.round((now - time) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

/**
 * Commands ranked by how this browser actually uses the board: "Suggested next" follows from the last command
 * (a first-order Markov chain), "Your top commands" by frecency. See lib/usage.ts.
 */
export default function QuickActionsPage({ commands, tickets, starterIds, now }: { commands: QuickCommand[]; tickets: { id: string; title: string }[]; starterIds: string[]; now: number }) {
  const { events, paused } = useUsage()
  const [chosenTicket, setChosenTicket] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const byId = new Map(commands.map((command) => [command.id, command]))
  const ticketExists = (id: string) => tickets.some((ticket) => ticket.id === id)
  const ticketId = chosenTicket && ticketExists(chosenTicket) ? chosenTicket : lastTicketWorkedOn(events, ticketExists) || tickets[0]?.id || ''

  const top = rankByFrecency(events, now).filter((item) => byId.has(item.command)).slice(0, TOP_COUNT)
  const lastCommand = [...events].reverse().find((event) => byId.has(event.c))?.c
  const next = lastCommand ? predictNext(events, lastCommand).filter((item) => byId.has(item.command)).slice(0, NEXT_COUNT) : []
  const starters = starterIds.map((id) => byId.get(id)).filter((command): command is QuickCommand => !!command)

  const run = (command: QuickCommand) => {
    if (command.needsTicket && !ticketId) { setNotice('Choose a ticket first.'); return }
    recordUse(command.id, command.needsTicket ? ticketId : undefined)
    command.run(ticketId)
    setNotice(command.needsTicket ? `${command.label} · ${ticketId}` : '')
  }

  const button = (command: QuickCommand, meta: string) => <button key={command.id} type="button" className="quick-command" onClick={() => run(command)}>
    <span className="quick-command-icon" aria-hidden="true">{command.icon}</span>
    <span className="quick-command-text"><b>{command.label}</b><small>{meta}{command.needsTicket && ticketId ? ` · on ${ticketId}` : ''}</small></span>
  </button>

  return <main className="main-content quick-page">
    <header className="quick-heading">
      <div>
        <div className="eyebrow">LEARNED FROM YOUR USE</div>
        <h1><Zap size={22} /> Quick actions</h1>
        <p>Your most-used commands, ranked from what you do in this browser. Nothing leaves this device.</p>
      </div>
      <div className="quick-controls">
        <span className="quick-learned">{paused ? 'Learning paused' : `${events.length} action${events.length === 1 ? '' : 's'} learned`}</span>
        <button type="button" onClick={() => setLearningPaused(!paused)}>{paused ? <><Play size={14} /> Resume learning</> : <><Pause size={14} /> Pause learning</>}</button>
        {confirmClear
          ? <span className="quick-confirm">Forget everything learned? <button type="button" className="quick-danger" onClick={() => { clearUsage(); setConfirmClear(false); setNotice('History cleared.') }}>Clear</button><button type="button" onClick={() => setConfirmClear(false)}>Keep</button></span>
          : <button type="button" onClick={() => setConfirmClear(true)} disabled={!events.length}><Trash2 size={14} /> Clear history</button>}
      </div>
    </header>

    <section className="quick-ticket" aria-label="Ticket for ticket commands">
      <label htmlFor="quick-ticket-select">Working on</label>
      <select id="quick-ticket-select" value={ticketId} onChange={(event) => setChosenTicket(event.target.value)}>
        {tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.id} · {ticket.title}</option>)}
      </select>
      <small>Ticket commands (open, work notes, set state) run on this ticket. It follows the last ticket you worked on.</small>
    </section>
    <p className="quick-notice" role="status">{notice}</p>

    {next.length > 0 && lastCommand && <section className="quick-section" aria-labelledby="quick-next-title">
      <h2 id="quick-next-title">Suggested next</h2>
      <p className="quick-why">After <b>{byId.get(lastCommand)!.label}</b>, this is what you usually do.</p>
      <div className="quick-grid quick-grid-next">{next.map((item) => button(byId.get(item.command)!, `${item.times} of ${item.outOf} times`))}</div>
    </section>}

    {top.length > 0
      ? <section className="quick-section" aria-labelledby="quick-top-title">
        <h2 id="quick-top-title">Your top commands</h2>
        <p className="quick-why">Ranked by how often and how recently you use them. A use counts half as much after {HALF_LIFE_DAYS} days.</p>
        <div className="quick-grid">{top.map((item) => button(byId.get(item.command)!, `Used ${item.uses}× · ${ago(item.lastUsed, now)}`))}</div>
      </section>
      : <section className="quick-section" aria-labelledby="quick-start-title">
        <h2 id="quick-start-title">Nothing learned yet</h2>
        <p className="quick-why">{paused ? 'Learning is paused. Resume it to rank your commands.' : 'Use the board as usual and your most-used commands will move here. These are common ones to start with.'}</p>
        <div className="quick-grid">{starters.map((command) => button(command, command.group))}</div>
      </section>}
  </main>
}
