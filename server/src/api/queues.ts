import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// Get all queues for a team
router.get('/teams/:teamId/queues', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query(
      'SELECT * FROM queues WHERE team_id = $1 ORDER BY name ASC',
      [teamId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching queues:', error);
    res.status(500).json({ error: 'Failed to fetch queues' });
  }
});

// Create queue
router.post('/queues', async (req: AuthRequest, res) => {
  try {
    const { team_id, name, description } = req.body;

    if (!team_id || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      'INSERT INTO queues (team_id, name, description) VALUES ($1, $2, $3) RETURNING *',
      [team_id, name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating queue:', error);
    res.status(500).json({ error: 'Failed to create queue' });
  }
});

// Update queue
router.put('/queues/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const result = await query(
      `UPDATE queues
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [name, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Queue not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating queue:', error);
    res.status(500).json({ error: 'Failed to update queue' });
  }
});

// Delete queue
router.delete('/queues/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM queues WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Queue not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting queue:', error);
    res.status(500).json({ error: 'Failed to delete queue' });
  }
});

export default router;
