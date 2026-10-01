/**
 * Page addresses. The app is still one file, but each page has its own address after the #, so the
 * browser's Back and Forward buttons move between pages and a refresh or bookmark opens the same page:
 *
 *   #/home   #/tickets   #/inventory   #/explore   #/explore/priority   #/explore/priority/OPS-101
 *
 * (#ticket=OPS-101, the full-page ticket record opened in a new tab, is handled separately in App.tsx.)
 */
export type PageId = 'home' | 'board' | 'inventory' | 'search' | 'explore' | 'new'
export type ExploreKey = 'active' | 'priority' | 'overdue' | 'escalated'
export type Route = { page: PageId; queue?: ExploreKey; ticket?: string }

export const EXPLORE_KEYS: ExploreKey[] = ['active', 'priority', 'overdue', 'escalated']
const SLUGS: Record<Exclude<PageId, 'explore' | 'new' | 'signin'>, string> = { home: 'home', board: 'tickets', inventory: 'inventory', search: 'search' }

const decode = (part: string) => { try { return decodeURIComponent(part) } catch { return part } }

/**
 * Parse location hash into a route object. Handles all page addresses with safe decoding.
 * @param hash - The location.hash string (e.g., "#/tickets", "#/explore/priority/OPS-101")
 * @returns Route object specifying the page and optional queue/ticket context
 */
export function parseRoute(hash: string): Route {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decode)
  if (first === 'tickets') return { page: 'board' }
  if (first === 'inventory') return { page: 'inventory' }
  if (first === 'search') return { page: 'search' }
  if (first === 'new') return { page: 'new' }
  if (first === 'explore') {
    const queue = EXPLORE_KEYS.find((key) => key === second)
    return { page: 'explore', queue, ticket: queue ? third : undefined }
  }
  return { page: 'home' }
}

/**
 * Convert a route object back to a location hash string.
 * @param route - Route object with page and optional explore queue/ticket
 * @returns Location hash string with proper encoding (e.g., "#/explore/priority/OPS-101")
 */
export function routeHash({ page, queue, ticket }: Route): string {
  if (page === 'new') return '#/' + page
  if (page !== 'explore') return '#/' + SLUGS[page]
  if (!queue) return '#/explore'
  return `#/explore/${queue}` + (ticket ? '/' + encodeURIComponent(ticket) : '')
}
