import './quick-page-nav.css'

export type PageId = 'home' | 'board' | 'inventory'
const PAGES: { id: PageId; label: string }[] = [{ id: 'home', label: 'Home' }, { id: 'board', label: 'Tickets' }, { id: 'inventory', label: 'Inventory' }]

/** Round previous / next arrows at the screen edges that go round Home, Tickets and Inventory. */
export default function QuickPageNav({ page, onChange }: { page: PageId; onChange: (page: PageId) => void }) {
  const index = PAGES.findIndex((item) => item.id === page)
  if (index < 0) return null
  const previous = PAGES[(index + PAGES.length - 1) % PAGES.length]
  const next = PAGES[(index + 1) % PAGES.length]
  return <nav className="quick-page-nav" aria-label="Quick page navigation">
    <button type="button" aria-label={`Previous page: ${previous.label}`} title={`Previous page: ${previous.label}`} onClick={() => onChange(previous.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg></button>
    <button type="button" aria-label={`Next page: ${next.label}`} title={`Next page: ${next.label}`} onClick={() => onChange(next.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg></button>
  </nav>
}
