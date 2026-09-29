import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// Get all tickets for a team
router.get('/teams/:teamId/tickets', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query(
      `SELECT t.*, u.name as assigned_to_name, q.name as queue_name
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN queues q ON t.queue_id = q.id
       WHERE t.team_id = $1
       ORDER BY t.created_at DESC`,
      [teamId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Get single ticket
router.get('/tickets/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT t.*, u.name as assigned_to_name, q.name as queue_name
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN queues q ON t.queue_id = q.id
       WHERE t.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// Create ticket
router.post('/tickets', async (req: AuthRequest, res) => {
  try {
    const { team_id, queue_id, title, description, priority } = req.body;

    if (!team_id || !queue_id || !title) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO tickets (team_id, queue_id, title, description, priority, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'open')
       RETURNING *`,
      [team_id, queue_id, title, description || null, priority || 'medium', req.user?.user_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Update ticket
router.put('/tickets/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assigned_to } = req.body;

    const result = await query(
      `UPDATE tickets
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           status = COALESCE($3, status),
           priority = COALESCE($4, priority),
           assigned_to = COALESCE($5, assigned_to),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [title, description, status, priority, assigned_to, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

export default router;
