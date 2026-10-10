import { Router, Response } from 'express';
import { getClient, query } from '../db/connection.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { isUuid, requireTeamRole } from '../utils/team-access.js';

// Teams and their members. Anyone signed in can create a team and becomes its admin;
// team admins add people who already have an account, by email.
const router = Router();
router.use(authMiddleware);

const teamMember = requireTeamRole('member');
const teamAdmin = requireTeamRole('admin');
const ROLES = ['member', 'admin'] as const;
type Role = typeof ROLES[number];
const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'team';

async function adminCount(teamId: string) {
  const result = await query(`SELECT count(*)::int AS admins FROM team_members WHERE team_id = $1 AND role = 'admin'`, [teamId]);
  return result.rows[0].admins as number;
}

// Teams the signed-in user belongs to, with their role in each.
router.get('/teams', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.user_id;
  if (!isUuid(userId)) return res.json([]);
  try {
    const result = await query(
      `SELECT t.id, t.name, t.slug, tm.role
         FROM team_members tm JOIN teams t ON t.id = tm.team_id
        WHERE tm.user_id = $1
        ORDER BY t.name`,
      [userId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing teams:', error);
    res.status(500).json({ error: 'Failed to load teams' });
  }
});

router.post('/teams', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.user_id;
  if (!isUuid(userId)) return res.status(403).json({ error: 'Sign in with an account on this server to create a team' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 100) return res.status(400).json({ error: 'Team name must be 1 to 100 characters' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`;
    const team = await client.query(
      'INSERT INTO teams (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id, name, slug',
      [name, slug, userId],
    );
    await client.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')`, [team.rows[0].id, userId]);
    await client.query('COMMIT');
    res.status(201).json({ ...team.rows[0], role: 'admin' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  } finally {
    client.release();
  }
});

router.get('/teams/:teamId/members', teamMember, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email, tm.role
         FROM team_members tm JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = $1
        ORDER BY tm.role = 'admin' DESC, u.name`,
      [req.params.teamId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing team members:', error);
    res.status(500).json({ error: 'Failed to load team members' });
  }
});

router.post('/teams/:teamId/members', teamAdmin, async (req: AuthRequest, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const role = req.body?.role ?? 'member';
  if (!email) return res.status(400).json({ error: 'Enter the email address of the person to add' });
  if (!isRole(role)) return res.status(400).json({ error: 'Role must be member or admin' });

  try {
    const user = await query(
      `SELECT id, name, email FROM users WHERE lower(email) = lower($1) ORDER BY email = $1 DESC LIMIT 1`,
      [email],
    );
    if (!user.rows.length) return res.status(404).json({ error: 'No account uses that email. Ask them to sign up first.' });
    const added = await query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_id) DO NOTHING RETURNING role`,
      [req.params.teamId, user.rows[0].id, role],
    );
    if (!added.rows.length) return res.status(409).json({ error: `${user.rows[0].email} is already in this team` });
    res.status(201).json({ ...user.rows[0], role });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

router.patch('/teams/:teamId/members/:userId', teamAdmin, async (req: AuthRequest, res: Response) => {
  const { teamId, userId } = req.params;
  const role = req.body?.role;
  if (!isUuid(userId)) return res.status(404).json({ error: 'Member not found' });
  if (!isRole(role)) return res.status(400).json({ error: 'Role must be member or admin' });

  try {
    const current = await query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
    if (!current.rows.length) return res.status(404).json({ error: 'Member not found' });
    if (current.rows[0].role === 'admin' && role !== 'admin' && (await adminCount(teamId)) <= 1) {
      return res.status(400).json({ error: 'A team needs at least one admin. Make someone else admin first.' });
    }
    await query('UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3', [role, teamId, userId]);
    res.json({ id: userId, role });
  } catch (error) {
    console.error('Error changing member role:', error);
    res.status(500).json({ error: 'Failed to change member role' });
  }
});

router.delete('/teams/:teamId/members/:userId', teamAdmin, async (req: AuthRequest, res: Response) => {
  const { teamId, userId } = req.params;
  if (!isUuid(userId)) return res.status(404).json({ error: 'Member not found' });

  try {
    const current = await query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
    if (!current.rows.length) return res.status(404).json({ error: 'Member not found' });
    if (current.rows[0].role === 'admin' && (await adminCount(teamId)) <= 1) {
      return res.status(400).json({ error: 'A team needs at least one admin. Make someone else admin first.' });
    }
    await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

export default router;
