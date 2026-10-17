import { useRef, useState } from 'react'
import { FileSpreadsheet, RotateCcw } from 'lucide-react'
import { clearImportedMatrix, contactFor, importEscalationMatrix, saveImportedMatrix, type ImportedContact, type ImportedMatrix } from '../lib/escalationMatrix'
import { XlsxError } from '../lib/xlsxRead'
import '../styles/escalation-import.css'

const dateLabel = (iso: string) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** Import from Excel / Use built-in matrix, at the top of Tools → Escalation matrix. */
export function MatrixImportBar({ matrix, onChange }: { matrix: ImportedMatrix | null; onChange: (matrix: ImportedMatrix | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const choose = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const imported = await importEscalationMatrix(file)
      saveImportedMatrix(imported)
      onChange(imported)
    } catch (caught) {
      setError(caught instanceof XlsxError ? caught.message : 'The workbook could not be read. Check that it opens in Excel and try again.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const reset = () => { clearImportedMatrix(); setError(''); onChange(null) }
  return <div className="matrix-import">
    <div className="matrix-import-row">
      <button type="button" className="matrix-import-button" onClick={() => input.current?.click()} disabled={busy}><FileSpreadsheet size={16} /> {busy ? 'Reading…' : matrix ? 'Import another file' : 'Import from Excel'}</button>
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-label="Escalation matrix workbook" onChange={(event) => void choose(event.target.files?.[0])} />
      {matrix && <button type="button" className="matrix-reset-button" onClick={reset}><RotateCcw size={14} /> Use built-in matrix</button>}
    </div>
    {matrix
      ? <p className="matrix-import-status" role="status">Using <b>{matrix.fileName}</b> (sheet “{matrix.sheet}”), imported {dateLabel(matrix.importedAt)}: {matrix.priorities.length} priorities, {matrix.routes.length} ticket types, {matrix.contacts.length} contacts.</p>
      : <p className="matrix-import-status">Load your own matrix from an Excel workbook with a priority table, routing by ticket type and a contact directory. It stays in this browser.</p>}
    {error && <p className="matrix-import-error" role="alert">{error}</p>}
  </div>
}

function ContactLine({ contact }: { contact: ImportedContact }) {
  return <div className="matrix-contact">
    <b>{contact.role || contact.name}</b>
    {contact.role && contact.name && <span>{contact.name}</span>}
    <small>
      {contact.emails.length ? contact.emails.map((email) => <a key={email} href={`mailto:${email}?subject=IT%20escalation`}>{email}</a>) : <em>No email listed</em>}
      {contact.phone && <span>{contact.phone}</span>}
      {contact.hours && <span>{contact.hours}</span>}
    </small>
  </div>
}

type Ticket = { id: string; title: string; severity: string }

/** The matrix panel's body when an imported matrix is in use. */
export function ImportedMatrixView({ matrix, tickets, focusId, onOpenTicket }: { matrix: ImportedMatrix; tickets: Ticket[]; focusId: string; onOpenTicket: (id: string) => void }) {
  return <>
    {matrix.priorities.length > 0 && <>
      <h3 className="section-label">Priority & service levels</h3>
      <div className="severity-list">{matrix.priorities.map((row) => {
        const related = tickets.filter((ticket) => ticket.severity.startsWith(row.level))
        return <article className="severity-row" key={row.level}>
          <div className="severity-top"><span className={`severity-badge ${row.level.toLowerCase()}`}>{row.level}</span><span className="severity-name">{row.label}</span></div>
          {row.definition && <p>{row.definition}</p>}
          {row.examples && <div className="example"><b>Example</b>{row.examples}</div>}
          <div className="sla-grid">
            <div><span>First response</span><b>{row.response || '—'}</b></div>
            <div><span>Resolution target</span><b>{row.resolution || '—'}</b></div>
            <div><span>Escalate to Tier 2</span><b>{row.tier2 || '—'}</b></div>
            <div><span>Escalate to Tier 3</span><b>{row.tier3 || '—'}</b></div>
          </div>
          {row.notifyManager && <div className="example"><b>Notify manager</b>{row.notifyManager}</div>}
          <div className="related-tickets"><span>Related tickets</span>{related.length ? related.map((ticket) => <button className={focusId === ticket.id ? 'selected' : ''} key={ticket.id} onClick={() => onOpenTicket(ticket.id)} title={`Show ${ticket.title} on the board`}>{ticket.id}</button>) : <em>None on board</em>}</div>
        </article>
      })}</div>
    </>}
    {matrix.routes.length > 0 && <>
      <h3 className="section-label contacts-label">Routing by ticket type</h3>
      <div className="matrix-routes">{matrix.routes.map((route) => <article className="matrix-route" key={route.ticketType}>
        <div className="matrix-route-head"><b>{route.ticketType}</b>{route.covers && <small>{route.covers}</small>}</div>
        <ol className="matrix-route-tiers">
          {([['Tier 1', route.tier1], ['Tier 2', route.tier2], ['Tier 3', route.tier3], ['Final', route.final]] as const).filter(([, text]) => text).map(([tier, text]) => {
            const contact = contactFor(text, matrix.contacts)
            return <li key={tier}><span>{tier}</span><div>{text}{contact?.emails[0] && <a href={`mailto:${contact.emails[0]}?subject=IT%20escalation`}>{contact.emails[0]}</a>}</div></li>
          })}
        </ol>
        {route.queue && <div className="matrix-route-queue"><span>Queue</span>{route.queue}</div>}
      </article>)}</div>
    </>}
    {matrix.contacts.length > 0 && <>
      <h3 className="section-label contacts-label">Contact directory</h3>
      <div className="matrix-contacts">{matrix.contacts.map((contact, index) => <ContactLine key={`${contact.role}-${contact.name}-${index}`} contact={contact} />)}</div>
    </>}
  </>
}
