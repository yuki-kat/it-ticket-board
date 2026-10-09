/**
 * SLA (Service Level Agreement) utilities for ticket tracking
 */

export interface SLATemplate {
  id: string;
  team_id: string;
  name: string;
  priority: string;
  response_time_minutes: number;
  resolution_time_hours: number;
}

export interface SLAStatus {
  responseDeadline: number; // timestamp
  resolutionDeadline: number; // timestamp
  timeToResponseDeadline: number; // ms
  timeToResolutionDeadline: number; // ms
  responseBreached: boolean;
  resolutionBreached: boolean;
  overallBreached: boolean;
  status: 'at-risk' | 'breached' | 'safe';
}

/**
 * Calculate SLA status for a ticket
 */
export function calculateSLAStatus(
  createdAt: string,
  firstResponseAt: string | null,
  resolvedAt: string | null,
  slaTemplate: SLATemplate,
  now: number = Date.now()
): SLAStatus {
  const createdTime = new Date(createdAt).getTime();
  const responseDeadline = createdTime + slaTemplate.response_time_minutes * 60 * 1000;
  const resolutionDeadline = createdTime + slaTemplate.resolution_time_hours * 60 * 60 * 1000;

  const firstResponseTime = firstResponseAt ? new Date(firstResponseAt).getTime() : null;
  const resolvedTime = resolvedAt ? new Date(resolvedAt).getTime() : null;

  const timeToResponseDeadline = responseDeadline - now;
  const timeToResolutionDeadline = resolutionDeadline - now;

  const responseBreached = firstResponseTime ? firstResponseTime > responseDeadline : now > responseDeadline;
  const resolutionBreached = resolvedTime ? resolvedTime > resolutionDeadline : now > resolutionDeadline;
  const overallBreached = responseBreached || resolutionBreached;

  let status: 'at-risk' | 'breached' | 'safe' = 'safe';
  if (overallBreached) {
    status = 'breached';
  } else if (timeToResponseDeadline < 15 * 60 * 1000 || timeToResolutionDeadline < 60 * 60 * 1000) {
    // At risk if less than 15 mins to response deadline or 1 hour to resolution
    status = 'at-risk';
  }

  return {
    responseDeadline,
    resolutionDeadline,
    timeToResponseDeadline,
    timeToResolutionDeadline,
    responseBreached,
    resolutionBreached,
    overallBreached,
    status,
  };
}

/**
 * Default SLA templates matching the provided matrix
 */
export const DEFAULT_SLA_TEMPLATES = [
  {
    name: 'P1 - Critical',
    priority: 'critical',
    response_time_minutes: 15,
    resolution_time_hours: 4,
  },
  {
    name: 'P2 - High',
    priority: 'high',
    response_time_minutes: 30,
    resolution_time_hours: 8,
  },
  {
    name: 'P3 - Medium',
    priority: 'medium',
    response_time_minutes: 240, // 4 hours
    resolution_time_hours: 48, // 2 business days
  },
  {
    name: 'P4 - Low',
    priority: 'low',
    response_time_minutes: 1440, // 1 business day
    resolution_time_hours: 120, // 5 business days
  },
];

/**
 * Escalation matrix thresholds (in minutes from creation)
 */
export const ESCALATION_MATRIX = {
  critical: {
    tier1: 0, // Immediate
    tier2: 0, // Immediate
    tier3: 30, // 30 minutes
  },
  high: {
    tier1: 0,
    tier2: 60, // 1 hour
    tier3: 240, // 4 hours
  },
  medium: {
    tier1: 0,
    tier2: 480, // 1 business day (8 hours)
    tier3: 2880, // 3 business days (72 hours)
  },
  low: {
    tier1: 0,
    tier2: 2880, // 3 business days (72 hours)
    tier3: Infinity, // As needed
  },
};

/**
 * Calculate escalation status for a ticket
 */
export function calculateEscalationStatus(
  createdAt: string,
  currentTier: number,
  now: number = Date.now()
): {
  nextTier: 2 | 3 | null;
  nextEscalationAt: number | null;
  isEscalationDue: boolean;
} {
  // This will be implemented per ticket priority
  return {
    nextTier: null,
    nextEscalationAt: null,
    isEscalationDue: false,
  };
}

/**
 * Format time delta for display
 */
export function formatTimeDelta(ms: number): string {
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
