import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { DEFAULT_SLA_TEMPLATES, calculateSLAStatus, ESCALATION_MATRIX } from '../utils/sla.js';

const router = Router();

router.use(authMiddleware);

// Initialize default SLA templates for a team
router.post('/teams/:teamId/sla-templates/init-defaults', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;

    for (const template of DEFAULT_SLA_TEMPLATES) {
      await query(
        `INSERT INTO sla_templates (team_id, name, priority, response_time_minutes, resolution_time_hours)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (team_id, name, priority) DO NOTHING`,
        [teamId, template.name, template.priority, template.response_time_minutes, template.resolution_time_hours]
      );
    }

    const result = await query(
      'SELECT * FROM sla_templates WHERE team_id = $1 ORDER BY priority, name ASC',
      [teamId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error initializing SLA templates:', error);
    res.status(500).json({ error: 'Failed to initialize SLA templates' });
  }
});

// Get all SLA templates for a team
router.get('/teams/:teamId/sla-templates', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query(
      'SELECT * FROM sla_templates WHERE team_id = $1 ORDER BY priority, name ASC',
      [teamId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching SLA templates:', error);
    res.status(500).json({ error: 'Failed to fetch SLA templates' });
  }
});

// Create SLA template
router.post('/sla-templates', async (req: AuthRequest, res) => {
  try {
    const { team_id, name, priority, response_time_minutes, resolution_time_hours } = req.body;

    if (!team_id || !name || !priority || !response_time_minutes || !resolution_time_hours) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO sla_templates (team_id, name, priority, response_time_minutes, resolution_time_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [team_id, name, priority, response_time_minutes, resolution_time_hours]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating SLA template:', error);
    res.status(500).json({ error: 'Failed to create SLA template' });
  }
});

// Update SLA template
router.put('/sla-templates/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, priority, response_time_minutes, resolution_time_hours } = req.body;

    const result = await query(
      `UPDATE sla_templates
       SET name = COALESCE($1, name),
           priority = COALESCE($2, priority),
           response_time_minutes = COALESCE($3, response_time_minutes),
           resolution_time_hours = COALESCE($4, resolution_time_hours),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [name, priority, response_time_minutes, resolution_time_hours, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SLA template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating SLA template:', error);
    res.status(500).json({ error: 'Failed to update SLA template' });
  }
});

// Delete SLA template
router.delete('/sla-templates/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM sla_templates WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SLA template not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting SLA template:', error);
    res.status(500).json({ error: 'Failed to delete SLA template' });
  }
});

// Get SLA status for a ticket
router.get('/tickets/:id/sla-status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const ticketResult = await query(
      `SELECT t.*, st.response_time_minutes, st.resolution_time_hours
       FROM tickets t
       LEFT JOIN sla_templates st ON t.sla_template_id = st.id
       WHERE t.id = $1`,
      [id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    if (!ticket.response_time_minutes || !ticket.resolution_time_hours) {
      return res.status(400).json({ error: 'No SLA template applied to this ticket' });
    }

    const slaTemplate = {
      response_time_minutes: ticket.response_time_minutes,
      resolution_time_hours: ticket.resolution_time_hours,
    };

    const slaStatus = calculateSLAStatus(
      ticket.created_at,
      ticket.first_response_at,
      ticket.status === 'resolved' ? ticket.updated_at : null,
      slaTemplate as any
    );

    res.json({
      ticketId: id,
      ...slaStatus,
      currentTier: ticket.current_escalation_tier,
      escalatedAt: ticket.escalated_to_tier_2_at || ticket.escalated_to_tier_3_at,
    });
  } catch (error) {
    console.error('Error fetching SLA status:', error);
    res.status(500).json({ error: 'Failed to fetch SLA status' });
  }
});

// Get escalation dashboard
router.get('/teams/:teamId/escalation-dashboard', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;

    // Get breached SLAs
    const breachedResult = await query(
      `SELECT t.id, t.title, t.priority, t.current_escalation_tier, t.sla_breached_at
       FROM tickets t
       WHERE t.team_id = $1 AND t.sla_breached = TRUE AND t.status != 'resolved'
       ORDER BY t.sla_breached_at ASC`,
      [teamId]
    );

    // Get at-risk tickets (escalation due soon)
    const now = Date.now();
    const atRiskResult = await query(
      `SELECT t.id, t.title, t.priority, t.current_escalation_tier, t.created_at
       FROM tickets t
       WHERE t.team_id = $1 AND t.status != 'resolved'
       LIMIT 50`,
      [teamId]
    );

    // Filter at-risk tickets based on escalation matrix
    const atRisk = atRiskResult.rows.filter((ticket: any) => {
      const createdTime = new Date(ticket.created_at).getTime();
      const ageMs = now - createdTime;
      const matrix = ESCALATION_MATRIX[ticket.priority as keyof typeof ESCALATION_MATRIX];
      if (!matrix) return false;

      const nextTier = Math.min(ticket.current_escalation_tier + 1, 3);
      const tierKey = `tier${nextTier}` as const;
      const nextTierMs = matrix[tierKey as keyof typeof matrix];
      return ageMs >= nextTierMs * 60 * 1000 * 0.75; // At risk if 75% to next escalation
    });

    res.json({
      breachedCount: breachedResult.rows.length,
      breached: breachedResult.rows,
      atRiskCount: atRisk.length,
      atRisk,
      escalationMatrix: ESCALATION_MATRIX,
    });
  } catch (error) {
    console.error('Error fetching escalation dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch escalation dashboard' });
  }
});

// Escalate a ticket
router.post('/tickets/:id/escalate', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason = 'manual' } = req.body;

    const ticketResult = await query(
      'SELECT id, team_id, title, priority, current_escalation_tier FROM tickets WHERE id = $1',
      [id]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];
    const newTier = Math.min(ticket.current_escalation_tier + 1, 3);

    if (newTier === ticket.current_escalation_tier) {
      return res.status(400).json({ error: 'Ticket is already at maximum escalation tier' });
    }

    // Update ticket escalation tier
    await query(
      `UPDATE tickets
       SET current_escalation_tier = $1,
           ${newTier === 2 ? 'escalated_to_tier_2_at' : 'escalated_to_tier_3_at'} = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newTier, id]
    );

    // Log escalation event
    await query(
      `INSERT INTO escalation_events (ticket_id, from_tier, to_tier, trigger_reason)
       VALUES ($1, $2, $3, $4)`,
      [id, ticket.current_escalation_tier, newTier, reason]
    );

    // Get escalation channel for the new tier
    const channelResult = await query(
      `SELECT * FROM escalation_channels
       WHERE team_id = $1 AND tier = $2
       LIMIT 1`,
      [ticket.team_id, newTier]
    );

    let escalationChannel = null;
    if (channelResult.rows.length > 0) {
      escalationChannel = channelResult.rows[0];
    }

    res.json({
      ticketId: id,
      oldTier: ticket.current_escalation_tier,
      newTier,
      escalationChannel,
      ticketTitle: ticket.title,
      ticketPriority: ticket.priority,
    });
  } catch (error) {
    console.error('Error escalating ticket:', error);
    res.status(500).json({ error: 'Failed to escalate ticket' });
  }
});

export default router;
