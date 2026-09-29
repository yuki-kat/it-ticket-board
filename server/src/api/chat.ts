import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { generateAISuggestions } from '../services/aiService.js';

const router = Router();

router.use(authMiddleware);

// Get chat history for a ticket
router.get('/tickets/:ticketId/chat', async (req: AuthRequest, res) => {
  try {
    const { ticketId } = req.params;
    const result = await query(
      `SELECT cm.*, u.name as user_name
       FROM chat_messages cm
       LEFT JOIN users u ON cm.user_id = u.id
       WHERE cm.ticket_id = $1
       ORDER BY cm.created_at ASC`,
      [ticketId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// Post a chat message
router.post('/tickets/:ticketId/chat', async (req: AuthRequest, res) => {
  try {
    const { ticketId } = req.params;
    const { content, messageType } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const ticketResult = await query('SELECT team_id FROM tickets WHERE id = $1', [ticketId]);
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const result = await query(
      `INSERT INTO chat_messages (team_id, ticket_id, user_id, content, message_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ticketResult.rows[0].team_id, ticketId, req.user?.user_id, content, messageType || 'user']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error posting message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// Get AI suggestions for a ticket
router.post('/tickets/:ticketId/ai-suggestions', async (req: AuthRequest, res) => {
  try {
    const { ticketId } = req.params;

    // Fetch ticket details
    const ticketResult = await query(
      'SELECT title, description, priority, assigned_to FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Generate AI suggestions
    const suggestions = await generateAISuggestions({
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      priority: ticket.priority,
      currentAssignee: ticket.assigned_to
    });

    // Store suggestions in cache
    for (const suggestion of suggestions) {
      await query(
        `INSERT INTO ai_suggestions (team_id, ticket_id, suggestion_type, content, confidence)
         VALUES ((SELECT team_id FROM tickets WHERE id = $1), $1, $2, $3, $4)`,
        [ticketId, suggestion.type, suggestion.content, suggestion.confidence]
      );
    }

    res.json(suggestions);
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// Get cached AI suggestions
router.get('/tickets/:ticketId/ai-suggestions', async (req: AuthRequest, res) => {
  try {
    const { ticketId } = req.params;
    const result = await query(
      'SELECT suggestion_type, content, confidence FROM ai_suggestions WHERE ticket_id = $1 ORDER BY created_at DESC',
      [ticketId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

export default router;
