import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// Get email config for a team
router.get('/teams/:teamId/email-config', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query('SELECT * FROM email_config WHERE team_id = $1', [teamId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email config not found' });
    }

    const config = result.rows[0];
    // Don't send password back to client
    delete config.smtp_password;
    res.json(config);
  } catch (error) {
    console.error('Error fetching email config:', error);
    res.status(500).json({ error: 'Failed to fetch email config' });
  }
});

// Create or update email config
router.put('/teams/:teamId/email-config', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const { smtp_host, smtp_port, smtp_user, smtp_password, from_email, from_name } = req.body;

    if (!smtp_host || !smtp_port || !smtp_user || !smtp_password || !from_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if config exists
    const existing = await query('SELECT id FROM email_config WHERE team_id = $1', [teamId]);

    let result;
    if (existing.rows.length > 0) {
      // Update
      result = await query(
        `UPDATE email_config
         SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_password = $4,
             from_email = $5, from_name = $6, updated_at = CURRENT_TIMESTAMP
         WHERE team_id = $7
         RETURNING id, team_id, smtp_host, smtp_port, smtp_user, from_email, from_name, notifications_enabled`,
        [smtp_host, smtp_port, smtp_user, smtp_password, from_email, from_name || null, teamId]
      );
    } else {
      // Create
      result = await query(
        `INSERT INTO email_config (team_id, smtp_host, smtp_port, smtp_user, smtp_password, from_email, from_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, team_id, smtp_host, smtp_port, smtp_user, from_email, from_name, notifications_enabled`,
        [teamId, smtp_host, smtp_port, smtp_user, smtp_password, from_email, from_name || null]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving email config:', error);
    res.status(500).json({ error: 'Failed to save email config' });
  }
});

// Toggle notifications
router.patch('/teams/:teamId/email-config/notifications', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const { enabled } = req.body;

    const result = await query(
      'UPDATE email_config SET notifications_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE team_id = $2 RETURNING *',
      [enabled, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email config not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating notifications setting:', error);
    res.status(500).json({ error: 'Failed to update notifications setting' });
  }
});

export default router;
