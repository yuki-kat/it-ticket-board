import { Router } from 'express';
import { getClient, query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  canViewEscalationHistory,
  canEscalateTicket,
  getEscalationHistoryWithAccess,
  rejectEscalationHistoryModification,
} from '../utils/escalation-access-control.js';
import { isUuid, requireTeamRole } from '../utils/team-access.js';

const router = Router();
router.use(authMiddleware);

// Team routes: members can read and escalate; team admins change groups and rules.
// Escalation history keeps its own rule (team admins, compliance officers, the ticket's creator).
const teamMember = requireTeamRole('member');
const teamAdmin = requireTeamRole('admin');

// ============ ACCESS CONTROL ============

// Set user as compliance officer (global admin only)
router.post('/admin/compliance-officers/:userId', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.user_id;

    if (!currentUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if current user is system admin (has admin role in multiple teams or special flag)
    const adminCheck = await query(
      `SELECT 1 FROM users WHERE id = $1 AND is_system_admin = TRUE`,
      [currentUserId]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only system admins can manage compliance officers' });
    }

    // Update user as compliance officer
    const result = await query(
      `UPDATE users SET is_compliance_officer = TRUE WHERE id = $1 RETURNING *`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: `User ${result.rows[0].email} is now a compliance officer` });
  } catch (error) {
    console.error('Error setting compliance officer:', error);
    res.status(500).json({ error: 'Failed to set compliance officer' });
  }
});

// Remove user as compliance officer (global admin only)
router.delete('/admin/compliance-officers/:userId', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.user_id;

    if (!currentUserId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if current user is system admin
    const adminCheck = await query(
      `SELECT 1 FROM users WHERE id = $1 AND is_system_admin = TRUE`,
      [currentUserId]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only system admins can manage compliance officers' });
    }

    // Update user to remove compliance officer flag
    const result = await query(
      `UPDATE users SET is_compliance_officer = FALSE WHERE id = $1 RETURNING *`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: `User ${result.rows[0].email} is no longer a compliance officer` });
  } catch (error) {
    console.error('Error removing compliance officer:', error);
    res.status(500).json({ error: 'Failed to remove compliance officer' });
  }
});

// ============ ASSIGNMENT GROUPS ============

// Create assignment group
router.post('/teams/:teamId/assignment-groups', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const {
      name,
      description,
      group_type,
      contact_type,
      contact_address,
      contact_phone,
      timezone,
      business_hours_start,
      business_hours_end,
    } = req.body;

    if (!name || !group_type || !contact_type || !contact_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO assignment_groups
       (team_id, name, description, group_type, contact_type, contact_address, contact_phone, timezone, business_hours_start, business_hours_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        teamId,
        name,
        description || null,
        group_type,
        contact_type,
        contact_address,
        contact_phone || null,
        timezone || 'UTC',
        business_hours_start || 9,
        business_hours_end || 18,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating assignment group:', error);
    res.status(500).json({ error: 'Failed to create assignment group' });
  }
});

// Get all assignment groups for team
router.get('/teams/:teamId/assignment-groups', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query(
      `SELECT ag.*,
        COUNT(DISTINCT agm.user_id) as member_count,
        COUNT(DISTINCT CASE WHEN agm.is_on_call THEN agm.user_id END) as on_call_count
       FROM assignment_groups ag
       LEFT JOIN assignment_group_members agm ON ag.id = agm.group_id
       WHERE ag.team_id = $1 AND ag.is_active = TRUE
       GROUP BY ag.id
       ORDER BY ag.name ASC`,
      [teamId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching assignment groups:', error);
    res.status(500).json({ error: 'Failed to fetch assignment groups' });
  }
});

// Update assignment group
router.put('/teams/:teamId/assignment-groups/:groupId', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId, groupId } = req.params;
    const { name, description, contact_type, contact_address, contact_phone, timezone } = req.body;

    const result = await query(
      `UPDATE assignment_groups
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           contact_type = COALESCE($3, contact_type),
           contact_address = COALESCE($4, contact_address),
           contact_phone = COALESCE($5, contact_phone),
           timezone = COALESCE($6, timezone),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND team_id = $8
       RETURNING *`,
      [name, description, contact_type, contact_address, contact_phone, timezone, groupId, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment group not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating assignment group:', error);
    res.status(500).json({ error: 'Failed to update assignment group' });
  }
});

router.delete('/teams/:teamId/assignment-groups/:groupId', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId, groupId } = req.params;
    if (!isUuid(groupId)) return res.status(404).json({ error: 'Assignment group not found' });
    const result = await query('DELETE FROM assignment_groups WHERE id = $1 AND team_id = $2 RETURNING id', [groupId, teamId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Assignment group not found' });
    res.json({ success: true });
  } catch (error) {
    if ((error as { code?: string }).code === '23503') {
      return res.status(409).json({ error: 'This group is used by escalation rules or tickets. Change those first.' });
    }
    console.error('Error deleting assignment group:', error);
    res.status(500).json({ error: 'Failed to delete assignment group' });
  }
});

// ============ ESCALATION MATRIX RULES ============

// Create escalation matrix rule (ticket type × priority × tier → group)
router.post('/teams/:teamId/escalation-rules', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const {
      ticket_type,
      priority,
      escalation_tier,
      assignment_group_id,
      escalation_method,
      escalate_after_hours,
      escalate_on_sla_breach,
      notify_channels,
      is_final_escalation,
    } = req.body;

    if (!ticket_type || !priority || !escalation_tier || !assignment_group_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO escalation_matrix_rules
       (team_id, ticket_type, priority, escalation_tier, assignment_group_id,
        escalation_method, escalate_after_hours, escalate_on_sla_breach, notify_channels, is_final_escalation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        teamId,
        ticket_type,
        priority,
        escalation_tier,
        assignment_group_id,
        escalation_method || 'both',
        escalate_after_hours || null,
        escalate_on_sla_breach !== false,
        notify_channels || 'email',
        is_final_escalation || false,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating escalation rule:', error);
    res.status(500).json({ error: 'Failed to create escalation rule' });
  }
});

// Get escalation rules for team (with group details)
router.get('/teams/:teamId/escalation-rules', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const { ticket_type, priority } = req.query;

    let sql = `
      SELECT emr.*, ag.name as group_name, ag.contact_type, ag.contact_address
      FROM escalation_matrix_rules emr
      JOIN assignment_groups ag ON emr.assignment_group_id = ag.id
      WHERE emr.team_id = $1
    `;
    const params: any[] = [teamId];

    if (ticket_type) {
      sql += ` AND emr.ticket_type = $${params.length + 1}`;
      params.push(ticket_type);
    }

    if (priority) {
      sql += ` AND emr.priority = $${params.length + 1}`;
      params.push(priority);
    }

    sql += ` ORDER BY emr.ticket_type, emr.priority, emr.escalation_tier ASC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching escalation rules:', error);
    res.status(500).json({ error: 'Failed to fetch escalation rules' });
  }
});

router.put('/teams/:teamId/escalation-rules/:ruleId', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId, ruleId } = req.params;
    if (!isUuid(ruleId)) return res.status(404).json({ error: 'Escalation rule not found' });
    const {
      ticket_type, priority, escalation_tier, assignment_group_id, escalation_method,
      escalate_after_hours, escalate_on_sla_breach, notify_channels, is_final_escalation,
    } = req.body;
    if (assignment_group_id !== undefined) {
      const group = await query('SELECT 1 FROM assignment_groups WHERE id = $1 AND team_id = $2', [assignment_group_id, teamId]);
      if (!isUuid(assignment_group_id) || group.rows.length === 0) return res.status(400).json({ error: 'Assignment group not found in this team' });
    }
    const result = await query(
      `UPDATE escalation_matrix_rules
       SET ticket_type = COALESCE($1, ticket_type),
           priority = COALESCE($2, priority),
           escalation_tier = COALESCE($3, escalation_tier),
           assignment_group_id = COALESCE($4, assignment_group_id),
           escalation_method = COALESCE($5, escalation_method),
           escalate_after_hours = $6,
           escalate_on_sla_breach = COALESCE($7, escalate_on_sla_breach),
           notify_channels = COALESCE($8, notify_channels),
           is_final_escalation = COALESCE($9, is_final_escalation),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND team_id = $11
       RETURNING *`,
      [ticket_type, priority, escalation_tier, assignment_group_id, escalation_method,
       escalate_after_hours ?? null, escalate_on_sla_breach, notify_channels, is_final_escalation, ruleId, teamId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Escalation rule not found' });
    res.json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'A rule for this ticket type, priority and tier already exists' });
    }
    console.error('Error updating escalation rule:', error);
    res.status(500).json({ error: 'Failed to update escalation rule' });
  }
});

router.delete('/teams/:teamId/escalation-rules/:ruleId', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId, ruleId } = req.params;
    if (!isUuid(ruleId)) return res.status(404).json({ error: 'Escalation rule not found' });
    const result = await query('DELETE FROM escalation_matrix_rules WHERE id = $1 AND team_id = $2 RETURNING id', [ruleId, teamId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Escalation rule not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting escalation rule:', error);
    res.status(500).json({ error: 'Failed to delete escalation rule' });
  }
});

// ============ TIME THRESHOLDS ============
// Minutes after a ticket opens (SLA pauses excluded) before auto-escalation moves it from tier 1 to 2 and 2 to 3.

const THRESHOLD_TYPES = ['incident', 'service_request', 'change', 'problem'];
const THRESHOLD_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const MAX_THRESHOLD_MINUTES = 60 * 24 * 365;

router.get('/teams/:teamId/escalation-thresholds', teamMember, async (req: AuthRequest, res) => {
  try {
    const result = await query(
      `SELECT ticket_type, priority, tier_1_minutes, tier_2_minutes, updated_at
         FROM escalation_time_thresholds WHERE team_id = $1 ORDER BY ticket_type, priority`,
      [req.params.teamId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching escalation thresholds:', error);
    res.status(500).json({ error: 'Failed to fetch time thresholds' });
  }
});

// Replaces the thresholds for the rows sent; a row with both values empty removes that combination.
router.put('/teams/:teamId/escalation-thresholds', teamAdmin, async (req: AuthRequest, res) => {
  const rows = Array.isArray(req.body?.thresholds) ? req.body.thresholds : null;
  if (!rows || rows.length === 0 || rows.length > THRESHOLD_TYPES.length * THRESHOLD_PRIORITIES.length) {
    return res.status(400).json({ error: 'Send a list of thresholds to save' });
  }
  const minutes = (value: unknown) => value === null || value === undefined || value === '' ? null : Number(value);
  const parsed = [];
  for (const row of rows) {
    const tier1 = minutes(row?.tier_1_minutes);
    const tier2 = minutes(row?.tier_2_minutes);
    if (!THRESHOLD_TYPES.includes(row?.ticket_type) || !THRESHOLD_PRIORITIES.includes(row?.priority)) {
      return res.status(400).json({ error: 'Unknown ticket type or priority' });
    }
    for (const value of [tier1, tier2]) {
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > MAX_THRESHOLD_MINUTES)) {
        return res.status(400).json({ error: 'Times must be whole minutes between 0 and 525600' });
      }
    }
    if (tier1 !== null && tier2 !== null && tier2 <= tier1) {
      return res.status(400).json({ error: `${row.priority}: tier 2 → 3 must be later than tier 1 → 2 (both count from when the ticket opened)` });
    }
    parsed.push({ type: row.ticket_type, priority: row.priority, tier1, tier2 });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const row of parsed) {
      if (row.tier1 === null && row.tier2 === null) {
        await client.query('DELETE FROM escalation_time_thresholds WHERE team_id = $1 AND ticket_type = $2 AND priority = $3', [req.params.teamId, row.type, row.priority]);
      } else {
        await client.query(
          `INSERT INTO escalation_time_thresholds (team_id, ticket_type, priority, tier_1_minutes, tier_2_minutes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (team_id, ticket_type, priority) DO UPDATE SET
             tier_1_minutes = $4, tier_2_minutes = $5, updated_at = CURRENT_TIMESTAMP`,
          [req.params.teamId, row.type, row.priority, row.tier1, row.tier2]
        );
      }
    }
    await client.query('COMMIT');
    const result = await query(
      `SELECT ticket_type, priority, tier_1_minutes, tier_2_minutes, updated_at
         FROM escalation_time_thresholds WHERE team_id = $1 ORDER BY ticket_type, priority`,
      [req.params.teamId]
    );
    res.json(result.rows);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error saving escalation thresholds:', error);
    res.status(500).json({ error: 'Failed to save time thresholds' });
  } finally {
    client.release();
  }
});

// Get next escalation tier for a ticket
router.get('/teams/:teamId/next-escalation/:ticketId', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId, ticketId } = req.params;

    // Get ticket details
    const ticketResult = await query(
      `SELECT ticket_type, priority, current_escalation_tier FROM tickets
       WHERE id = $1 AND team_id = $2`,
      [ticketId, teamId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const nextTier = Math.min(ticket.current_escalation_tier + 1, 3);

    // Get the escalation rule for next tier
    const ruleResult = await query(
      `SELECT emr.*, ag.name as group_name, ag.contact_type, ag.contact_address, ag.contact_phone
       FROM escalation_matrix_rules emr
       JOIN assignment_groups ag ON emr.assignment_group_id = ag.id
       WHERE emr.team_id = $1
         AND emr.ticket_type = $2
         AND emr.priority = $3
         AND emr.escalation_tier = $4`,
      [teamId, ticket.ticket_type, ticket.priority, nextTier]
    );

    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'No escalation rule found for next tier' });
    }

    res.json({
      currentTier: ticket.current_escalation_tier,
      nextTier,
      nextAssignmentGroup: ruleResult.rows[0],
    });
  } catch (error) {
    console.error('Error fetching next escalation:', error);
    res.status(500).json({ error: 'Failed to fetch next escalation' });
  }
});

// ============ ESCALATION EXECUTION ============

// Escalate ticket (manual or automatic)
router.post('/teams/:teamId/tickets/:ticketId/escalate-advanced', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId, ticketId } = req.params;
    const { reason, escalated_by_user_id } = req.body;
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check access control
    const accessCheck = await canEscalateTicket(userId, ticketId, teamId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ error: accessCheck.reason });
    }

    // Get ticket
    const ticketResult = await query(
      `SELECT id, ticket_type, priority, current_escalation_tier, sla_breached
       FROM tickets WHERE id = $1 AND team_id = $2`,
      [ticketId, teamId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const nextTier = Math.min(ticket.current_escalation_tier + 1, 3);

    if (nextTier === ticket.current_escalation_tier) {
      return res.status(400).json({ error: 'Ticket is already at maximum escalation tier' });
    }

    // Get escalation rule for next tier
    const ruleResult = await query(
      `SELECT * FROM escalation_matrix_rules
       WHERE team_id = $1 AND ticket_type = $2 AND priority = $3 AND escalation_tier = $4`,
      [teamId, ticket.ticket_type, ticket.priority, nextTier]
    );

    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'No escalation rule configured for this tier' });
    }

    const rule = ruleResult.rows[0];

    // Update ticket tier
    await query(
      `UPDATE tickets
       SET current_escalation_tier = $1,
           current_assignment_group_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nextTier, rule.assignment_group_id, ticketId]
    );

    // Log escalation in history
    await query(
      `INSERT INTO escalation_history
       (ticket_id, team_id, from_tier, to_tier, from_group_id, to_group_id,
        escalation_reason, escalated_by, sla_impact, ticket_priority, ticket_type)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10)`,
      [
        ticketId,
        teamId,
        ticket.current_escalation_tier,
        nextTier,
        rule.assignment_group_id,
        reason || 'manual',
        escalated_by_user_id || req.user?.user_id,
        ticket.sla_breached ? 'breached' : 'at_risk',
        ticket.priority,
        ticket.ticket_type,
      ]
    );

    // Get group details for notification
    const groupResult = await query(
      `SELECT * FROM assignment_groups WHERE id = $1`,
      [rule.assignment_group_id]
    );

    const group = groupResult.rows[0];

    res.json({
      ticketId,
      oldTier: ticket.current_escalation_tier,
      newTier: nextTier,
      assignmentGroup: group,
      notificationChannels: rule.notify_channels?.split(',') || ['email'],
    });
  } catch (error) {
    console.error('Error escalating ticket:', error);
    res.status(500).json({ error: 'Failed to escalate ticket' });
  }
});

// Get escalation history for ticket (with access control)
router.get('/teams/:teamId/tickets/:ticketId/escalation-history', async (req: AuthRequest, res) => {
  try {
    const { teamId, ticketId } = req.params;
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check access control
    const accessCheck = await canViewEscalationHistory(userId, ticketId, teamId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ error: accessCheck.reason });
    }

    const result = await query(
      `SELECT eh.*, ag.name as to_group_name, u.name as escalated_by_name
       FROM escalation_history eh
       LEFT JOIN assignment_groups ag ON eh.to_group_id = ag.id
       LEFT JOIN users u ON eh.escalated_by = u.id
       WHERE eh.ticket_id = $1 AND eh.team_id = $2
       ORDER BY eh.created_at DESC`,
      [ticketId, teamId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching escalation history:', error);
    res.status(500).json({ error: 'Failed to fetch escalation history' });
  }
});

// Check for tickets that need automatic escalation (background job)
router.post('/teams/:teamId/check-auto-escalations', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;

    // Get all active tickets
    const ticketsResult = await query(
      `SELECT t.*, tst.tier_1_minutes, tst.tier_2_minutes, tst.tier_3_minutes
       FROM tickets t
       LEFT JOIN escalation_time_thresholds tst ON t.team_id = tst.team_id
         AND t.ticket_type = tst.ticket_type AND t.priority = tst.priority
       WHERE t.team_id = $1 AND t.status IN ('open', 'in_progress')
         AND t.escalation_locked = FALSE
         AND COALESCE(t.sla_paused, FALSE) = FALSE
         AND (t.last_escalation_check IS NULL OR t.last_escalation_check < NOW() - INTERVAL '5 minutes')`,
      [teamId]
    );

    const escalatedTickets = [];

    for (const ticket of ticketsResult.rows) {
      if (ticket.tier_1_minutes == null && ticket.tier_2_minutes == null) continue; // No thresholds for this type and priority

      // Time paused for the SLA (e.g. waiting on the user) does not count towards escalation.
      const ageMinutes = Math.floor(
        (new Date().getTime() - new Date(ticket.created_at).getTime() - Number(ticket.sla_paused_total_ms || 0)) / 60000
      );

      let shouldEscalate = false;
      let reason = '';

      if (ticket.current_escalation_tier === 1 && ticket.tier_1_minutes != null && ageMinutes >= ticket.tier_1_minutes) {
        shouldEscalate = true;
        reason = `auto_escalate_after_${ticket.tier_1_minutes}min`;
      } else if (ticket.current_escalation_tier === 2 && ticket.tier_2_minutes != null && ageMinutes >= ticket.tier_2_minutes) {
        shouldEscalate = true;
        reason = `auto_escalate_after_${ticket.tier_2_minutes}min`;
      } else if (ticket.current_escalation_tier === 3 && ticket.tier_3_minutes != null && ageMinutes >= ticket.tier_3_minutes) {
        shouldEscalate = true;
        reason = `auto_escalate_after_${ticket.tier_3_minutes}min`;
      }

      if (shouldEscalate) {
        const nextTier = Math.min(ticket.current_escalation_tier + 1, 3);
        const newTier = nextTier;

        if (newTier > ticket.current_escalation_tier) {
          // Get escalation rule
          const ruleResult = await query(
            `SELECT * FROM escalation_matrix_rules
             WHERE team_id = $1 AND ticket_type = $2 AND priority = $3 AND escalation_tier = $4`,
            [teamId, ticket.ticket_type, ticket.priority, newTier]
          );

          if (ruleResult.rows.length > 0) {
            const rule = ruleResult.rows[0];

            // Update ticket
            await query(
              `UPDATE tickets
               SET current_escalation_tier = $1,
                   current_assignment_group_id = $2,
                   last_escalation_check = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $3`,
              [newTier, rule.assignment_group_id, ticket.id]
            );

            // Log escalation
            await query(
              `INSERT INTO escalation_history
               (ticket_id, team_id, from_tier, to_tier, to_group_id,
                escalation_reason, sla_impact, ticket_priority, ticket_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                ticket.id,
                teamId,
                ticket.current_escalation_tier,
                newTier,
                rule.assignment_group_id,
                reason,
                ticket.sla_breached ? 'breached' : 'at_risk',
                ticket.priority,
                ticket.ticket_type,
              ]
            );

            escalatedTickets.push({
              ticketId: ticket.id,
              oldTier: ticket.current_escalation_tier,
              newTier,
              reason,
            });
          }
        }
      } else {
        // Update last check time
        await query(`UPDATE tickets SET last_escalation_check = CURRENT_TIMESTAMP WHERE id = $1`, [
          ticket.id,
        ]);
      }
    }

    res.json({
      checked: ticketsResult.rows.length,
      escalated: escalatedTickets.length,
      escalations: escalatedTickets,
    });
  } catch (error) {
    console.error('Error checking auto-escalations:', error);
    res.status(500).json({ error: 'Failed to check auto-escalations' });
  }
});

export default router;
