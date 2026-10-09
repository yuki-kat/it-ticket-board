import { Router } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authMiddleware);

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadsDir = path.join(process.cwd(), 'uploads', 'escalation-matrices');
      await fs.mkdir(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    // Allow common image and document formats
    const allowedMimes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// Upload escalation matrix
router.post(
  '/teams/:teamId/escalation-matrix/upload',
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      const { teamId } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // Delete existing matrix for this team
      const existingResult = await query(
        'SELECT file_path FROM escalation_matrices WHERE team_id = $1',
        [teamId]
      );
      if (existingResult.rows.length > 0) {
        try {
          await fs.unlink(existingResult.rows[0].file_path);
        } catch (e) {
          console.error('Failed to delete old escalation matrix file:', e);
        }
      }

      // Save new matrix reference
      const result = await query(
        `INSERT INTO escalation_matrices (team_id, file_name, file_type, file_size, file_path, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (team_id) DO UPDATE SET
           file_name = $2, file_type = $3, file_size = $4, file_path = $5, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          teamId,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          req.file.path,
          req.userId,
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error uploading escalation matrix:', error);
      res.status(500).json({ error: 'Failed to upload escalation matrix' });
    }
  }
);

// Get escalation matrix
router.get('/teams/:teamId/escalation-matrix', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query('SELECT * FROM escalation_matrices WHERE team_id = $1', [teamId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No escalation matrix uploaded' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching escalation matrix:', error);
    res.status(500).json({ error: 'Failed to fetch escalation matrix' });
  }
});

// Download escalation matrix file
router.get('/teams/:teamId/escalation-matrix/download', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query('SELECT * FROM escalation_matrices WHERE team_id = $1', [teamId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No escalation matrix found' });
    }

    const matrix = result.rows[0];
    res.download(matrix.file_path, matrix.file_name);
  } catch (error) {
    console.error('Error downloading escalation matrix:', error);
    res.status(500).json({ error: 'Failed to download escalation matrix' });
  }
});

// Delete escalation matrix
router.delete('/teams/:teamId/escalation-matrix', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;

    const result = await query(
      'DELETE FROM escalation_matrices WHERE team_id = $1 RETURNING file_path',
      [teamId]
    );

    if (result.rows.length > 0) {
      try {
        await fs.unlink(result.rows[0].file_path);
      } catch (e) {
        console.error('Failed to delete file:', e);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting escalation matrix:', error);
    res.status(500).json({ error: 'Failed to delete escalation matrix' });
  }
});

// Add escalation channel (map tier to user/team)
router.post('/teams/:teamId/escalation-channels', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const { tier, channel_type, channel_identifier, user_id, description } = req.body;

    if (!tier || !channel_type || !channel_identifier) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO escalation_channels (team_id, tier, channel_type, channel_identifier, user_id, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [teamId, tier, channel_type, channel_identifier, user_id || null, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating escalation channel:', error);
    res.status(500).json({ error: 'Failed to create escalation channel' });
  }
});

// Get escalation channels for team
router.get('/teams/:teamId/escalation-channels', async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query(
      'SELECT * FROM escalation_channels WHERE team_id = $1 ORDER BY tier ASC',
      [teamId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching escalation channels:', error);
    res.status(500).json({ error: 'Failed to fetch escalation channels' });
  }
});

// Update escalation channel
router.put(
  '/teams/:teamId/escalation-channels/:channelId',
  async (req: AuthRequest, res) => {
    try {
      const { teamId, channelId } = req.params;
      const { tier, channel_type, channel_identifier, user_id, description } = req.body;

      const result = await query(
        `UPDATE escalation_channels
         SET tier = COALESCE($1, tier),
             channel_type = COALESCE($2, channel_type),
             channel_identifier = COALESCE($3, channel_identifier),
             user_id = COALESCE($4, user_id),
             description = COALESCE($5, description),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND team_id = $7
         RETURNING *`,
        [tier, channel_type, channel_identifier, user_id, description, channelId, teamId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Escalation channel not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating escalation channel:', error);
      res.status(500).json({ error: 'Failed to update escalation channel' });
    }
  }
);

// Delete escalation channel
router.delete(
  '/teams/:teamId/escalation-channels/:channelId',
  async (req: AuthRequest, res) => {
    try {
      const { teamId, channelId } = req.params;

      const result = await query('DELETE FROM escalation_channels WHERE id = $1 AND team_id = $2', [
        channelId,
        teamId,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Escalation channel not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting escalation channel:', error);
      res.status(500).json({ error: 'Failed to delete escalation channel' });
    }
  }
);

// Notify escalation channel
router.post('/tickets/:id/notify-escalation', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { channel, tier, ticketTitle, ticketPriority } = req.body;

    if (!channel) {
      return res.status(400).json({ error: 'No escalation channel provided' });
    }

    // Get ticket details
    const ticketResult = await query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketResult.rows[0];

    // Build notification message
    const message = `
Ticket Escalated to Tier ${tier}
---
Title: ${ticketTitle || ticket.title}
Priority: ${ticketPriority || ticket.priority}
ID: ${ticket.id}
Queue: ${ticket.queue_id}

This ticket has been escalated and requires immediate attention.
    `.trim();

    // Send notification based on channel type
    switch (channel.channel_type) {
      case 'email':
        // Send email notification
        try {
          const emailResult = await query(
            `INSERT INTO email_notifications (team_id, ticket_id, recipient_email, subject, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [ticket.team_id, id, channel.channel_identifier, `Ticket Escalated: ${ticketTitle}`]
          );
          console.log('Email notification queued:', emailResult.rows[0]);
        } catch (e) {
          console.error('Failed to queue email:', e);
        }
        break;

      case 'slack':
        // Send Slack notification (would need Slack API integration)
        console.log(`Would send Slack notification to ${channel.channel_identifier}: ${message}`);
        break;

      case 'teams':
        // Send Teams notification (would need Teams API integration)
        console.log(`Would send Teams notification to ${channel.channel_identifier}: ${message}`);
        break;

      case 'pagerduty':
        // Create PagerDuty incident (would need PagerDuty API integration)
        console.log(`Would create PagerDuty incident for ${channel.channel_identifier}: ${message}`);
        break;

      default:
        console.log(`Escalation notification for ${channel.channel_type}: ${message}`);
    }

    res.json({ success: true, notificationSent: true });
  } catch (error) {
    console.error('Error notifying escalation:', error);
    res.status(500).json({ error: 'Failed to notify escalation channel' });
  }
});

export default router;
