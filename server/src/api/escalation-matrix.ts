import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs/promises';
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

// Matrix documents (escalation and SLA) share the same routes. Files are stored in Postgres (file_data):
// the hosting plan's local disk is wiped whenever the service sleeps. file_path is only read for rows
// uploaded before that change, and such rows are moved into the database the first time they are downloaded.
type MatrixKind = 'escalation' | 'sla';
const MATRICES: Record<MatrixKind, { table: string; label: string; defaultName: string; svg: () => string }> = {
  escalation: { table: 'escalation_matrices', label: 'escalation matrix', defaultName: 'Default Escalation Matrix', svg: generateDefaultEscalationMatrixSvg },
  sla: { table: 'sla_matrices', label: 'SLA matrix', defaultName: 'Default SLA Matrix', svg: generateDefaultSlaMatrixSvg },
};
const MATRIX_COLUMNS = 'id, team_id, file_name, file_type, file_size, uploaded_by, created_at, updated_at';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req: Request, file, cb: FileFilterCallback) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

// Multer reports a too-large or wrong-type file as an error; answer it as a 400 the page can show.
const receiveFile = (req: Request, res: Response, next: NextFunction) =>
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'File is larger than 10 MB'
      : error instanceof Error ? error.message : 'Upload failed';
    res.status(400).json({ error: message });
  });

async function removeLegacyFile(filePath: string | null | undefined) {
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => {});
}

// The escalation and SLA pages load together; ON CONFLICT keeps two concurrent first visits safe.
async function ensureDefaultMatrix(kind: MatrixKind, teamId: string, userId: string) {
  const matrix = MATRICES[kind];
  const svg = Buffer.from(matrix.svg());
  await query(
    `INSERT INTO ${matrix.table} (team_id, file_name, file_type, file_size, file_data, uploaded_by)
     VALUES ($1, $2, 'image/svg+xml', $3, $4, $5)
     ON CONFLICT (team_id) DO NOTHING`,
    [teamId, matrix.defaultName, svg.length, svg, userId]
  );
}

function addMatrixRoutes(kind: MatrixKind) {
  const matrix = MATRICES[kind];
  const base = `/teams/:teamId/${kind}-matrix`;

  router.post(`${base}/upload`, teamAdmin, receiveFile, async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.params;
      const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ error: 'No file provided' });

      const previous = await query(`SELECT file_path FROM ${matrix.table} WHERE team_id = $1`, [teamId]);
      const result = await query(
        `INSERT INTO ${matrix.table} (team_id, file_name, file_type, file_size, file_data, file_path, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)
         ON CONFLICT (team_id) DO UPDATE SET
           file_name = $2, file_type = $3, file_size = $4, file_data = $5, file_path = NULL,
           uploaded_by = $6, updated_at = CURRENT_TIMESTAMP
         RETURNING ${MATRIX_COLUMNS}`,
        [teamId, file.originalname, file.mimetype, file.size, file.buffer, req.user?.user_id]
      );
      await removeLegacyFile(previous.rows[0]?.file_path);
      res.json(result.rows[0]);
    } catch (error) {
      console.error(`Error uploading ${matrix.label}:`, error);
      res.status(500).json({ error: `Failed to upload ${matrix.label}` });
    }
  });

  router.get(base, teamMember, async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.params;
      const select = () => query(`SELECT ${MATRIX_COLUMNS} FROM ${matrix.table} WHERE team_id = $1`, [teamId]);
      let result = await select();
      if (result.rows.length === 0 && req.user?.user_id) {
        await ensureDefaultMatrix(kind, teamId, req.user.user_id);
        result = await select();
      }
      if (result.rows.length === 0) return res.status(404).json({ error: `No ${matrix.label} available` });
      res.json(result.rows[0]);
    } catch (error) {
      console.error(`Error fetching ${matrix.label}:`, error);
      res.status(500).json({ error: `Failed to fetch ${matrix.label}` });
    }
  });

  router.get(`${base}/download`, teamMember, async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.params;
      const result = await query(`SELECT file_name, file_type, file_data, file_path FROM ${matrix.table} WHERE team_id = $1`, [teamId]);
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: `No ${matrix.label} found` });

      let data: Buffer | null = row.file_data;
      if (!data && row.file_path) data = await fs.readFile(row.file_path).catch(() => null);
      if (!data && row.file_name === matrix.defaultName) data = Buffer.from(matrix.svg());
      if (!data) return res.status(404).json({ error: 'This file is no longer stored on the server. Upload it again.' });
      if (!row.file_data) {
        await query(`UPDATE ${matrix.table} SET file_data = $1, file_size = $2, file_path = NULL WHERE team_id = $3`, [data, data.length, teamId]);
        await removeLegacyFile(row.file_path);
      }

      res.attachment(row.file_name);
      res.type(row.file_type);
      res.send(data);
    } catch (error) {
      console.error(`Error downloading ${matrix.label}:`, error);
      res.status(500).json({ error: `Failed to download ${matrix.label}` });
    }
  });

  router.delete(base, teamAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const result = await query(`DELETE FROM ${matrix.table} WHERE team_id = $1 RETURNING file_path`, [req.params.teamId]);
      await removeLegacyFile(result.rows[0]?.file_path);
      res.json({ success: true });
    } catch (error) {
      console.error(`Error deleting ${matrix.label}:`, error);
      res.status(500).json({ error: `Failed to delete ${matrix.label}` });
    }
  });
}

addMatrixRoutes('escalation');

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

addMatrixRoutes('sla');

export default router;
