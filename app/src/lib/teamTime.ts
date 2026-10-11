/**
 * Time with each team (the internal "OLA" view) next to the customer's SLA.
 *
 * The customer's SLA clocks never reset when a ticket moves between assignment groups. Each team instead gets a
 * segment: when it received the ticket and when it handed it on. The open segment is the current team. A resolved
 * ticket's last segment ends at its resolution time.
 */
export type TeamSegment = { group: string; from: string; to?: string }
type TeamTicket = { assignmentGroup: string; createdAt: string; status: string; resolvedAt?: string; teamHistory?: TeamSegment[] }

export const teamLabel = (group: string) => group || 'Unassigned'

/** Oldest first. Tickets saved before handoffs were tracked start with one segment: their group since creation. */
export function teamSegments(ticket: TeamTicket, groupBefore = ticket.assignmentGroup): TeamSegment[] {
  return ticket.teamHistory?.length ? ticket.teamHistory : [{ group: groupBefore, from: ticket.createdAt }]
}

/** Records a handoff when the assignment group differs from the open segment's group. Unchanged tickets are returned as they are. */
export function trackTeamChange<T extends TeamTicket>(previous: T | undefined, ticket: T, at: string): T {
  const segments = teamSegments(ticket, previous?.assignmentGroup ?? ticket.assignmentGroup)
  const last = segments[segments.length - 1]
  if (!last.to && last.group === ticket.assignmentGroup) return ticket
  const closed = last.to ? segments : [...segments.slice(0, -1), { ...last, to: at }]
  return { ...ticket, teamHistory: [...closed, { group: ticket.assignmentGroup, from: at }] }
}

export function segmentEnd(segment: TeamSegment, ticket: TeamTicket, now: number): number {
  if (segment.to) return Date.parse(segment.to)
  return ticket.status === 'Resolved' && ticket.resolvedAt ? Date.parse(ticket.resolvedAt) : now
}

export const segmentMs = (segment: TeamSegment, ticket: TeamTicket, now: number) => Math.max(0, segmentEnd(segment, ticket, now) - Date.parse(segment.from))

export function currentTeam(ticket: TeamTicket, now: number) {
  const segments = teamSegments(ticket)
  const last = segments[segments.length - 1]
  return { group: last.group, ms: segmentMs(last, ticket, now), handoffs: segments.length - 1 }
}

export type TeamTotals = { group: string; tickets: number; ms: number; overTarget: number; handedOn: number }

/** Time each team held the given tickets, longest first. overTarget counts stays longer than that ticket's team target. */
export function timePerTeam<T extends TeamTicket>(tickets: T[], now: number, targetMs: (ticket: T) => number): TeamTotals[] {
  const totals = new Map<string, TeamTotals & { ids: Set<T> }>()
  for (const ticket of tickets) {
    for (const segment of teamSegments(ticket)) {
      const name = teamLabel(segment.group)
      const entry = totals.get(name) || { group: name, tickets: 0, ms: 0, overTarget: 0, handedOn: 0, ids: new Set<T>() }
      const ms = segmentMs(segment, ticket, now)
      entry.ms += ms
      entry.ids.add(ticket)
      if (ms > targetMs(ticket)) entry.overTarget += 1
      if (segment.to) entry.handedOn += 1
      totals.set(name, entry)
    }
  }
  return [...totals.values()].map(({ ids, ...entry }) => ({ ...entry, tickets: ids.size })).sort((a, b) => b.ms - a.ms)
}

export function shortDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
