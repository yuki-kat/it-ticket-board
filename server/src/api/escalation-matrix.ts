import { Router, Request } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { isUuid, requireTeamRole } from '../utils/team-access.js';

const router = Router();
router.use(authMiddleware);

// Reading a team's matrices and channels needs membership; changing them needs a team admin.
const teamMember = requireTeamRole('member');
const teamAdmin = requireTeamRole('admin');
const ticketTeamMember = requireTeamRole('member', async (req) => {
  if (!isUuid(req.params.id)) return undefined;
  const result = await query('SELECT team_id FROM tickets WHERE id = $1', [req.params.id]);
  return result.rows[0]?.team_id;
});

// Helper function to create default escalation matrix SVG
function generateDefaultEscalationMatrixSvg(): string {
  return `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
    <style>
      .header { font-size: 20px; font-weight: bold; fill: #1a2b2f; }
      .subheader { font-size: 14px; fill: #5a6b6f; font-weight: 600; }
      .cell-text { font-size: 12px; fill: #1a2b2f; text-anchor: middle; }
      .border { stroke: #e2e6e4; stroke-width: 1; }
    </style>

    <text x="400" y="30" class="header" text-anchor="middle">Escalation Matrix</text>

    <!-- Headers -->
    <rect x="50" y="60" width="150" height="40" class="border" fill="#f0fffe"/>
    <text x="125" y="90" class="subheader">Ticket Type / Priority</text>

    <rect x="200" y="60" width="120" height="40" class="border" fill="#2a9f9e"/>
    <text x="260" y="90" class="cell-text" fill="white">Tier 1</text>

    <rect x="320" y="60" width="120" height="40" class="border" fill="#1a7f7e"/>
    <text x="380" y="90" class="cell-text" fill="white">Tier 2</text>

    <rect x="440" y="60" width="120" height="40" class="border" fill="#0f5f5e"/>
    <text x="500" y="90" class="cell-text" fill="white">Tier 3</text>

    <rect x="560" y="60" width="180" height="40" class="border" fill="#f0f1f0"/>
    <text x="650" y="90" class="subheader">Escalation Trigger</text>

    <!-- Incident - Critical -->
    <rect x="50" y="100" width="150" height="40" class="border" fill="#f0f1f0"/>
    <text x="125" y="130" class="cell-text">Incident / Critical</text>

    <rect x="200" y="100" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="260" y="130" class="cell-text">Service Desk</text>

    <rect x="320" y="100" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="380" y="130" class="cell-text">Senior Team</text>

    <rect x="440" y="100" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="500" y="130" class="cell-text">IT Director</text>

    <rect x="560" y="100" width="180" height="40" class="border" fill="#f0fffe"/>
    <text x="650" y="130" class="cell-text">15 min response</text>

    <!-- Incident - High -->
    <rect x="50" y="140" width="150" height="40" class="border" fill="#f0f1f0"/>
    <text x="125" y="170" class="cell-text">Incident / High</text>

    <rect x="200" y="140" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="260" y="170" class="cell-text">Service Desk</text>

    <rect x="320" y="140" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="380" y="170" class="cell-text">IT Team</text>

    <rect x="440" y="140" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="500" y="170" class="cell-text">IT Manager</text>

    <rect x="560" y="140" width="180" height="40" class="border" fill="#f0fffe"/>
    <text x="650" y="170" class="cell-text">30 min response</text>

    <!-- Service Request - Medium -->
    <rect x="50" y="180" width="150" height="40" class="border" fill="#f0f1f0"/>
    <text x="125" y="210" class="cell-text">Service Req / Med</text>

    <rect x="200" y="180" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="260" y="210" class="cell-text">Service Desk</text>

    <rect x="320" y="180" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="380" y="210" class="cell-text">IT Team</text>

    <rect x="440" y="180" width="120" height="40" class="border" fill="#f0fffe"/>
    <text x="500" y="210" class="cell-text">IT Manager</text>

    <rect x="560" y="180" width="180" height="40" class="border" fill="#f0fffe"/>
    <text x="650" y="210" class="cell-text">4 hour response</text>

    <text x="400" y="450" class="cell-text" fill="#8a9b9f">Contact your IT management to customize this matrix based on your SLAs</text>
  </svg>`;
}

// Helper function to create default SLA matrix SVG
function generateDefaultSlaMatrixSvg(): string {
  return `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
    <style>
      .header { font-size: 20px; font-weight: bold; fill: #1a2b2f; }
      .subheader { font-size: 14px; fill: #5a6b6f; font-weight: 600; }
      .cell-text { font-size: 12px; fill: #1a2b2f; text-anchor: middle; }
      .border { stroke: #e2e6e4; stroke-width: 1; }
    </style>

    <text x="400" y="30" class="header" text-anchor="middle">SLA Matrix</text>
    <text x="400" y="55" class="subheader" text-anchor="middle">Response and Resolution Times</text>

    <!-- Headers -->
    <rect x="50" y="80" width="130" height="40" class="border" fill="#f0fffe"/>
    <text x="115" y="110" class="subheader">Priority</text>

    <rect x="180" y="80" width="150" height="40" class="border" fill="#2a9f9e"/>
    <text x="255" y="110" class="cell-text" fill="white">Response Time</text>

    <rect x="330" y="80" width="150" height="40" class="border" fill="#1a7f7e"/>
    <text x="405" y="110" class="cell-text" fill="white">Resolution Time</text>

    <rect x="480" y="80" width="280" height="40" class="border" fill="#f0f1f0"/>
    <text x="620" y="110" class="subheader">Definition</text>

    <!-- Critical -->
    <rect x="50" y="120" width="130" height="50" class="border" fill="#f0f1f0"/>
    <text x="115" y="150" class="cell-text">Critical (P1)</text>

    <rect x="180" y="120" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="255" y="145" class="cell-text">15 minutes</text>
    <text x="255" y="160" class="cell-text" fill="#8a9b9f">(24/7)</text>

    <rect x="330" y="120" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="405" y="145" class="cell-text">4 hours</text>
    <text x="405" y="160" class="cell-text" fill="#8a9b9f">(24/7)</text>

    <rect x="480" y="120" width="280" height="50" class="border" fill="#f0fffe"/>
    <text x="620" y="140" class="cell-text">Complete outage or</text>
    <text x="620" y="155" class="cell-text">major impact</text>

    <!-- High -->
    <rect x="50" y="170" width="130" height="50" class="border" fill="#f0f1f0"/>
    <text x="115" y="200" class="cell-text">High (P2)</text>

    <rect x="180" y="170" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="255" y="195" class="cell-text">1 hour</text>
    <text x="255" y="210" class="cell-text" fill="#8a9b9f">(Business hrs)</text>

    <rect x="330" y="170" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="405" y="195" class="cell-text">1 business day</text>
    <text x="405" y="210" class="cell-text" fill="#8a9b9f"></text>

    <rect x="480" y="170" width="280" height="50" class="border" fill="#f0fffe"/>
    <text x="620" y="190" class="cell-text">Significant impact,</text>
    <text x="620" y="205" class="cell-text">workaround available</text>

    <!-- Medium -->
    <rect x="50" y="220" width="130" height="50" class="border" fill="#f0f1f0"/>
    <text x="115" y="250" class="cell-text">Medium (P3)</text>

    <rect x="180" y="220" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="255" y="245" class="cell-text">4 hours</text>
    <text x="255" y="260" class="cell-text" fill="#8a9b9f"></text>

    <rect x="330" y="220" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="405" y="245" class="cell-text">3 business days</text>
    <text x="405" y="260" class="cell-text" fill="#8a9b9f"></text>

    <rect x="480" y="220" width="280" height="50" class="border" fill="#f0fffe"/>
    <text x="620" y="240" class="cell-text">Limited impact,</text>
    <text x="620" y="255" class="cell-text">single user affected</text>

    <!-- Low -->
    <rect x="50" y="270" width="130" height="50" class="border" fill="#f0f1f0"/>
    <text x="115" y="300" class="cell-text">Low (P4)</text>

    <rect x="180" y="270" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="255" y="295" class="cell-text">1 business day</text>
    <text x="255" y="310" class="cell-text" fill="#8a9b9f"></text>

    <rect x="330" y="270" width="150" height="50" class="border" fill="#f0fffe"/>
    <text x="405" y="295" class="cell-text">5 business days</text>
    <text x="405" y="310" class="cell-text" fill="#8a9b9f"></text>

    <rect x="480" y="270" width="280" height="50" class="border" fill="#f0fffe"/>
    <text x="620" y="290" class="cell-text">Minimal impact,</text>
    <text x="620" y="305" class="cell-text">general question</text>
  </svg>`;
}

// Initialize default matrices for a team
async function initializeDefaultMatrices(teamId: string, userId: string) {
  try {
    // Check if matrices already exist
    const existingEsc = await query('SELECT id FROM escalation_matrices WHERE team_id = $1', [teamId]);
    const existingSla = await query('SELECT id FROM sla_matrices WHERE team_id = $1', [teamId]);

    if (existingEsc.rows.length === 0) {
      const escSvg = generateDefaultEscalationMatrixSvg();
      const escPath = path.join(process.cwd(), 'uploads', 'escalation-matrices', `default-escalation-${teamId}.svg`);

      await fs.mkdir(path.dirname(escPath), { recursive: true });
      await fs.writeFile(escPath, escSvg);

      await query(
        `INSERT INTO escalation_matrices (team_id, file_name, file_type, file_size, file_path, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [teamId, 'Default Escalation Matrix', 'image/svg+xml', escSvg.length, escPath, userId]
      );
    }

    if (existingSla.rows.length === 0) {
      const slaSvg = generateDefaultSlaMatrixSvg();
      const slaPath = path.join(process.cwd(), 'uploads', 'sla-matrices', `default-sla-${teamId}.svg`);

      await fs.mkdir(path.dirname(slaPath), { recursive: true });
      await fs.writeFile(slaPath, slaSvg);

      await query(
        `INSERT INTO sla_matrices (team_id, file_name, file_type, file_size, file_path, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [teamId, 'Default SLA Matrix', 'image/svg+xml', slaSvg.length, slaPath, userId]
      );
    }
  } catch (error) {
    console.error('Error initializing default matrices:', error);
  }
}

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads', 'escalation-matrices');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: Request, _file, cb: (error: Error | null, destination: string) => void) => {
      fs.mkdir(uploadsDir, { recursive: true })
        .then(() => cb(null, uploadsDir))
        .catch(err => cb(err, uploadsDir));
    },
    filename: (_req: Request, file, cb: (error: Error | null, filename: string) => void) => {
      const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req: Request, file, cb: FileFilterCallback) => {
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
  teamAdmin,
  upload.single('file'),
  async (req: AuthRequest & { file?: any }, res) => {
    try {
      const { teamId } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
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
          userId,
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error uploading escalation matrix:', error);
      res.status(500).json({ error: 'Failed to upload escalation matrix' });
    }
  }
);

// Get escalation matrix (with auto-initialize defaults)
router.get('/teams/:teamId/escalation-matrix', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user?.user_id;

    let result = await query('SELECT * FROM escalation_matrices WHERE team_id = $1', [teamId]);

    if (result.rows.length === 0) {
      // Initialize defaults if not present
      if (userId) {
        await initializeDefaultMatrices(teamId, userId);
        result = await query('SELECT * FROM escalation_matrices WHERE team_id = $1', [teamId]);
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No escalation matrix available' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching escalation matrix:', error);
    res.status(500).json({ error: 'Failed to fetch escalation matrix' });
  }
});

// Download escalation matrix file
router.get('/teams/:teamId/escalation-matrix/download', teamMember, async (req: AuthRequest, res) => {
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
router.delete('/teams/:teamId/escalation-matrix', teamAdmin, async (req: AuthRequest, res) => {
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
router.post('/teams/:teamId/escalation-channels', teamAdmin, async (req: AuthRequest, res) => {
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
router.get('/teams/:teamId/escalation-channels', teamMember, async (req: AuthRequest, res) => {
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
  teamAdmin,
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
  teamAdmin,
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
router.post('/tickets/:id/notify-escalation', ticketTeamMember, async (req: AuthRequest, res) => {
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

// Configure multer for SLA matrix uploads
const slaUploadsDir = path.join(process.cwd(), 'uploads', 'sla-matrices');

const slaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req: Request, _file, cb: (error: Error | null, destination: string) => void) => {
      fs.mkdir(slaUploadsDir, { recursive: true })
        .then(() => cb(null, slaUploadsDir))
        .catch(err => cb(err, slaUploadsDir));
    },
    filename: (_req: Request, file, cb: (error: Error | null, filename: string) => void) => {
      const uniqueSuffix = `${Date.now()}-${uuidv4()}`;
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext);
      cb(null, `${name}-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req: Request, file, cb: FileFilterCallback) => {
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

// Upload SLA matrix
router.post(
  '/teams/:teamId/sla-matrix/upload',
  teamAdmin,
  slaUpload.single('file'),
  async (req: AuthRequest & { file?: any }, res) => {
    try {
      const { teamId } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Delete existing matrix for this team
      const existingResult = await query(
        'SELECT file_path FROM sla_matrices WHERE team_id = $1',
        [teamId]
      );
      if (existingResult.rows.length > 0) {
        try {
          await fs.unlink(existingResult.rows[0].file_path);
        } catch (e) {
          console.error('Failed to delete old SLA matrix file:', e);
        }
      }

      // Save new matrix reference
      const result = await query(
        `INSERT INTO sla_matrices (team_id, file_name, file_type, file_size, file_path, uploaded_by)
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
          userId,
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error uploading SLA matrix:', error);
      res.status(500).json({ error: 'Failed to upload SLA matrix' });
    }
  }
);

// Get SLA matrix (with auto-initialize defaults)
router.get('/teams/:teamId/sla-matrix', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user?.user_id;

    let result = await query('SELECT * FROM sla_matrices WHERE team_id = $1', [teamId]);

    if (result.rows.length === 0) {
      // Initialize defaults if not present
      if (userId) {
        await initializeDefaultMatrices(teamId, userId);
        result = await query('SELECT * FROM sla_matrices WHERE team_id = $1', [teamId]);
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No SLA matrix available' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching SLA matrix:', error);
    res.status(500).json({ error: 'Failed to fetch SLA matrix' });
  }
});

// Download SLA matrix file
router.get('/teams/:teamId/sla-matrix/download', teamMember, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;
    const result = await query('SELECT * FROM sla_matrices WHERE team_id = $1', [teamId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No SLA matrix found' });
    }

    const matrix = result.rows[0];
    res.download(matrix.file_path, matrix.file_name);
  } catch (error) {
    console.error('Error downloading SLA matrix:', error);
    res.status(500).json({ error: 'Failed to download SLA matrix' });
  }
});

// Delete SLA matrix
router.delete('/teams/:teamId/sla-matrix', teamAdmin, async (req: AuthRequest, res) => {
  try {
    const { teamId } = req.params;

    const result = await query(
      'DELETE FROM sla_matrices WHERE team_id = $1 RETURNING file_path',
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
    console.error('Error deleting SLA matrix:', error);
    res.status(500).json({ error: 'Failed to delete SLA matrix' });
  }
});

export default router;
