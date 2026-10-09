import { query } from '../db/connection.js';

/**
 * Access Control for escalation_history table
 * Enforces GDPR-compliant audit log access
 */

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if user can view escalation history for a specific ticket
 */
export async function canViewEscalationHistory(
  userId: string,
  ticketId: string,
  teamId: string
): Promise<AccessCheckResult> {
  try {
    // Check 1: Is user a team admin?
    const adminCheck = await query(
      `SELECT 1 FROM team_members
       WHERE team_id = $1 AND user_id = $2 AND role = 'admin'`,
      [teamId, userId]
    );
    if (adminCheck.rows.length > 0) {
      return { allowed: true };
    }

    // Check 2: Is user a compliance officer?
    const complianceCheck = await query(
      `SELECT 1 FROM users
       WHERE id = $1 AND is_compliance_officer = TRUE`,
      [userId]
    );
    if (complianceCheck.rows.length > 0) {
      return { allowed: true };
    }

    // Check 3: Did user create the ticket?
    const creatorCheck = await query(
      `SELECT 1 FROM tickets
       WHERE id = $1 AND created_by = $2`,
      [ticketId, userId]
    );
    if (creatorCheck.rows.length > 0) {
      return { allowed: true };
    }

    // If none of the above, deny access
    return {
      allowed: false,
      reason: 'User does not have permission to view escalation history for this ticket',
    };
  } catch (error) {
    console.error('Error checking escalation view access:', error);
    return { allowed: false, reason: 'Access check failed' };
  }
}

/**
 * Check if user can escalate a ticket
 */
export async function canEscalateTicket(
  userId: string,
  ticketId: string,
  teamId: string
): Promise<AccessCheckResult> {
  try {
    // Only team members can escalate (checked via team membership)
    const memberCheck = await query(
      `SELECT 1 FROM team_members
       WHERE team_id = $1 AND user_id = $2`,
      [teamId, userId]
    );
    if (memberCheck.rows.length === 0) {
      return {
        allowed: false,
        reason: 'User is not a member of this team',
      };
    }

    // Ticket must belong to the team
    const ticketCheck = await query(
      `SELECT 1 FROM tickets
       WHERE id = $1 AND team_id = $2`,
      [ticketId, teamId]
    );
    if (ticketCheck.rows.length === 0) {
      return {
        allowed: false,
        reason: 'Ticket does not belong to this team',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Error checking escalate permission:', error);
    return { allowed: false, reason: 'Access check failed' };
  }
}

/**
 * Get escalation history for a ticket with access control
 */
export async function getEscalationHistoryWithAccess(
  userId: string,
  ticketId: string,
  teamId: string
) {
  // Check access first
  const accessCheck = await canViewEscalationHistory(userId, ticketId, teamId);
  if (!accessCheck.allowed) {
    return { allowed: false, reason: accessCheck.reason };
  }

  // If allowed, fetch the data
  try {
    const result = await query(
      `SELECT eh.*, ag.name as to_group_name, u.name as escalated_by_name
       FROM escalation_history eh
       LEFT JOIN assignment_groups ag ON eh.to_group_id = ag.id
       LEFT JOIN users u ON eh.escalated_by = u.id
       WHERE eh.ticket_id = $1 AND eh.team_id = $2
       ORDER BY eh.created_at DESC`,
      [ticketId, teamId]
    );

    return { allowed: true, data: result.rows };
  } catch (error) {
    console.error('Error fetching escalation history:', error);
    return { allowed: false, reason: 'Failed to fetch escalation history' };
  }
}

/**
 * Enforce immutability - prevent UPDATE/DELETE on escalation_history
 */
export function rejectEscalationHistoryModification(
  operation: 'UPDATE' | 'DELETE'
): AccessCheckResult {
  return {
    allowed: false,
    reason: `Escalation history is immutable and cannot be ${operation}d for audit compliance`,
  };
}

/**
 * Get user's role and permissions for a team
 */
export async function getUserTeamRole(
  userId: string,
  teamId: string
): Promise<{ role: string; isComplianceOfficer: boolean } | null> {
  try {
    const result = await query(
      `SELECT tm.role, u.is_compliance_officer
       FROM team_members tm
       LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.user_id = $1 AND tm.team_id = $2`,
      [userId, teamId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      role: result.rows[0].role,
      isComplianceOfficer: result.rows[0].is_compliance_officer || false,
    };
  } catch (error) {
    console.error('Error fetching user team role:', error);
    return null;
  }
}
