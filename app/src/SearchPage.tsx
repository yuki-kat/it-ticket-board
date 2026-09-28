import { useMemo, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

type Status = 'New' | 'In Progress' | 'Waiting on User' | 'Escalated' | 'Resolved'
type Severity = 'P1 – Critical' | 'P2 – High' | 'P3 – Medium' | 'P4 – Low'
type RecordType = 'Incident' | 'Problem' | 'Change Request' | 'Work Order'

interface TicketItem {
  id: string
  recordType: RecordType
  title: string
  description: string
  requester: string
  assignee: string
  severity: Severity
  status: Status
  createdAt: string
  dueAt: string
  affectedUser: string
}

type SortBy = 'id' | 'title' | 'status' | 'severity' | 'assignee' | 'requester' | 'created' | 'due'
type SortDir = 'asc' | 'desc'

function SearchPage({
  tickets,
  openTicket
}: {
  tickets: TicketItem[]
  openTicket: (id: string) => void
}) {
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'All statuses'>('All statuses')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'All severities'>('All severities')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('All assignees')
  const [requesterFilter, setRequesterFilter] = useState<string>('All requesters')
  const [typeFilter, setTypeFilter] = useState<RecordType | 'All types'>('All types')
  const [sortBy, setSortBy] = useState<SortBy>('id')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const statuses: Status[] = ['New', 'In Progress', 'Waiting on User', 'Escalated', 'Resolved']
  const severities: Severity[] = ['P1 – Critical', 'P2 – High', 'P3 – Medium', 'P4 – Low']
  const recordTypes: RecordType[] = ['Incident', 'Problem', 'Change Request', 'Work Order']

  const assigneeOptions = useMemo(() => {
    const assignees = new Set(tickets.map((t) => t.assignee.trim()).filter(Boolean))
    return Array.from(assignees).sort()
  }, [tickets])

  const requesterOptions = useMemo(() => {
    const requesters = new Set(tickets.map((t) => t.requester.trim()).filter(Boolean))
    return Array.from(requesters).sort()
  }, [tickets])

  const results = useMemo(() => {
    let filtered = tickets.filter((ticket) => {
      const searchLower = searchText.toLowerCase()
      const matchesSearch = !searchText.trim() ||
        `${ticket.id} ${ticket.title} ${ticket.description} ${ticket.requester} ${ticket.assignee} ${ticket.affectedUser}`.toLowerCase().includes(searchLower)
      const matchesStatus = statusFilter === 'All statuses' || ticket.status === statusFilter
      const matchesSeverity = severityFilter === 'All severities' || ticket.severity === severityFilter
      const matchesAssignee = assigneeFilter === 'All assignees' || ticket.assignee === assigneeFilter
      const matchesRequester = requesterFilter === 'All requesters' || ticket.requester === requesterFilter
      const matchesType = typeFilter === 'All types' || ticket.recordType === typeFilter

      return matchesSearch && matchesStatus && matchesSeverity && matchesAssignee && matchesRequester && matchesType
    })

    filtered.sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''

      if (sortBy === 'id') {
        aVal = a.id
        bVal = b.id
      } else if (sortBy === 'title') {
        aVal = a.title.toLowerCase()
        bVal = b.title.toLowerCase()
      } else if (sortBy === 'status') {
        aVal = a.status
        bVal = b.status
      } else if (sortBy === 'severity') {
        const severityOrder = { 'P1 – Critical': 0, 'P2 – High': 1, 'P3 – Medium': 2, 'P4 – Low': 3 }
        aVal = severityOrder[a.severity as Severity] ?? 4
        bVal = severityOrder[b.severity as Severity] ?? 4
      } else if (sortBy === 'assignee') {
        aVal = a.assignee.toLowerCase()
        bVal = b.assignee.toLowerCase()
      } else if (sortBy === 'requester') {
        aVal = a.requester.toLowerCase()
        bVal = b.requester.toLowerCase()
      } else if (sortBy === 'created') {
        aVal = new Date(a.createdAt).getTime()
        bVal = new Date(b.createdAt).getTime()
      } else if (sortBy === 'due') {
        aVal = new Date(a.dueAt).getTime()
        bVal = new Date(b.dueAt).getTime()
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [tickets, searchText, statusFilter, severityFilter, assigneeFilter, requesterFilter, typeFilter, sortBy, sortDir])

  const filtersActive = searchText.trim() !== '' ||
    statusFilter !== 'All statuses' ||
    severityFilter !== 'All severities' ||
    assigneeFilter !== 'All assignees' ||
    requesterFilter !== 'All requesters' ||
    typeFilter !== 'All types'

  const clearFilters = () => {
    setSearchText('')
    setStatusFilter('All statuses')
    setSeverityFilter('All severities')
    setAssigneeFilter('All assignees')
    setRequesterFilter('All requesters')
    setTypeFilter('All types')
  }

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const SortHeader = ({ field, label }: { field: SortBy; label: string }) => (
    <button
      className="sort-header"
      onClick={() => toggleSort(field)}
      title={`Sort by ${label}`}
    >
      {label}
      {sortBy === field && <span className={`sort-indicator ${sortDir}`}>▼</span>}
    </button>
  )

  return (
    <main className="main-content search-page">
      <section className="page-section search-header">
        <div className="page-heading">
          <div>
            <div className="eyebrow">FIND & FILTER</div>
            <h1>Search tickets</h1>
            <p className="subtitle">Find any ticket across all statuses. Search by ID, title, requester, assignee, or description.</p>
          </div>
        </div>
      </section>

      <section className="search-controls">
        <label className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by ID, title, requester, assignee..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoFocus
          />
          {searchText && <button onClick={() => setSearchText('')} aria-label="Clear search"><X size={14} /></button>}
        </label>

        <div className="filter-controls">
          <label className="filter-select">
            <span>Status</span>
            <div className="select-wrapper">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | 'All statuses')}>
                <option>All statuses</option>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>

          <label className="filter-select">
            <span>Severity</span>
            <div className="select-wrapper">
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as Severity | 'All severities')}>
                <option>All severities</option>
                {severities.map((s) => <option key={s}>{s}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>

          <label className="filter-select">
            <span>Assignee</span>
            <div className="select-wrapper">
              <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                <option>All assignees</option>
                {assigneeOptions.map((a) => <option key={a}>{a}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>

          <label className="filter-select">
            <span>Requester</span>
            <div className="select-wrapper">
              <select value={requesterFilter} onChange={(e) => setRequesterFilter(e.target.value)}>
                <option>All requesters</option>
                {requesterOptions.map((r) => <option key={r}>{r}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>

          <label className="filter-select">
            <span>Type</span>
            <div className="select-wrapper">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as RecordType | 'All types')}>
                <option>All types</option>
                {recordTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </label>

          {filtersActive && <button className="clear-btn" onClick={clearFilters}>Clear filters</button>}
        </div>
      </section>

      <section className="search-results">
        <div className="results-header">
          <span className="results-count">{results.length} result{results.length !== 1 ? 's' : ''}</span>
        </div>

        {results.length > 0 ? (
          <table className="results-table">
            <thead>
              <tr>
                <th><SortHeader field="id" label="ID" /></th>
                <th><SortHeader field="title" label="Title" /></th>
                <th><SortHeader field="status" label="Status" /></th>
                <th><SortHeader field="severity" label="Severity" /></th>
                <th><SortHeader field="assignee" label="Assignee" /></th>
                <th><SortHeader field="requester" label="Requester" /></th>
                <th><SortHeader field="created" label="Created" /></th>
              </tr>
            </thead>
            <tbody>
              {results.map((ticket) => (
                <tr key={ticket.id} className="result-row" onClick={() => openTicket(ticket.id)}>
                  <td className="id-cell"><strong>{ticket.id}</strong></td>
                  <td className="title-cell">{ticket.title}</td>
                  <td className="status-cell"><span className={`status-badge ${ticket.status.toLowerCase().replace(/\s+/g, '-')}`}>{ticket.status}</span></td>
                  <td className="severity-cell"><span className={`severity-badge ${ticket.severity.startsWith('P1') ? 'critical' : ticket.severity.startsWith('P2') ? 'high' : ticket.severity.startsWith('P3') ? 'medium' : 'low'}`}>{ticket.severity.split(' – ')[0]}</span></td>
                  <td className="assignee-cell">{ticket.assignee || '—'}</td>
                  <td className="requester-cell">{ticket.requester}</td>
                  <td className="created-cell">{new Date(ticket.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="results-empty">
            <Search size={28} />
            <h3>No tickets match these filters</h3>
            <p>Try adjusting your search or filters to find what you're looking for.</p>
            {filtersActive && <button className="clear-btn primary" onClick={clearFilters}>Clear all filters</button>}
          </div>
        )}
      </section>
    </main>
  )
}

export default SearchPage
