import type { NextFunction, Response } from 'express';
import { query } from '../db/connection.js';
import type { AuthRequest } from '../middleware/auth.js';

export type TeamRole = 'member' | 'admin';

type RunQuery = (text: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | undefined) => !!value && UUID.test(value);

export interface TeamAccess {
  status: 200 | 401 | 403 | 404;
  error?: string;
}

/** System admins pass; otherwise the user must be in team_members for the team, as an admin when `needed` is 'admin'. */
export async function checkTeamAccess(userId: string | undefined, teamId: string | undefined, needed: TeamRole, runQuery: RunQuery = query): Promise<TeamAccess> {
  if (!userId) return { status: 401, error: 'Not authenticated' };
  if (!isUuid(teamId)) return { status: 404, error: 'Team not found' };
  if (!isUuid(userId)) return { status: 403, error: 'You are not a member of this team' };

  const { rows } = await runQuery(
    `SELECT u.is_system_admin, tm.role
       FROM users u
       LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $1
      WHERE u.id = $2`,
    [teamId, userId],
  );
  const row = rows[0];
  if (row?.is_system_admin) return { status: 200 };
  if (!row?.role) return { status: 403, error: 'You are not a member of this team' };
  if (needed === 'admin' && row.role !== 'admin') return { status: 403, error: 'Only team admins can change this' };
  return { status: 200 };
}

/** Route guard for /teams/:teamId/... Place it before multer so rejected uploads are never written to disk. */
export function requireTeamRole(needed: TeamRole, teamIdOf: (req: AuthRequest) => Promise<string | undefined> | string | undefined = (req) => req.params.teamId) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const access = await checkTeamAccess(req.user?.user_id, await teamIdOf(req), needed);
      if (access.status !== 200) return res.status(access.status).json({ error: access.error });
      next();
    } catch (error) {
      console.error('Team access check failed:', error);
      res.status(500).json({ error: 'Team access check failed' });
    }
  };
}
