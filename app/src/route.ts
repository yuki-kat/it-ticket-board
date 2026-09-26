/**
 * Page addresses. The app is still one file, but each page has its own address after the #, so the
 * browser's Back and Forward buttons move between pages and a refresh or bookmark opens the same page:
 *
 *   #/home   #/tickets   #/inventory   #/explore   #/explore/priority   #/explore/priority/OPS-101
 *
 * (#ticket=OPS-101, the full-page ticket record opened in a new tab, is handled separately in App.tsx.)
 */
export type PageId = 'home' | 'board' | 'inventory' | 'explore'
export type ExploreKey = 'active' | 'priority' | 'overdue' | 'escalated'
export type Route = { page: PageId; queue?: ExploreKey; ticket?: string }

export const EXPLORE_KEYS: ExploreKey[] = ['active', 'priority', 'overdue', 'escalated']
const SLUGS: Record<Exclude<PageId, 'explore'>, string> = { home: 'home', board: 'tickets', inventory: 'inventory' }

const decode = (part: string) => { try { return decodeURIComponent(part) } catch { return part } }

export function parseRoute(hash: string): Route {
  const [first, second, third] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decode)
  if (first === 'tickets') return { page: 'board' }
  if (first === 'inventory') return { page: 'inventory' }
  if (first === 'explore') {
    const queue = EXPLORE_KEYS.find((key) => key === second)
    return { page: 'explore', queue, ticket: queue ? third : undefined }
  }
  return { page: 'home' }
}

export function routeHash({ page, queue, ticket }: Route): string {
  if (page !== 'explore') return '#/' + SLUGS[page]
  if (!queue) return '#/explore'
  return `#/explore/${queue}` + (ticket ? '/' + encodeURIComponent(ticket) : '')
}
