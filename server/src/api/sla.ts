import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

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

export default router;
