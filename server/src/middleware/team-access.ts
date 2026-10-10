import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { getUserTeamRole } from '../utils/escalation-access-control.js';

export type TeamRole = 'admin' | 'member';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Allow the request only if the signed-in user is in team_members for :teamId.
 * Pass 'admin' to also require the team admin role.
 * Must run after authMiddleware, and before multer on upload routes so a
 * rejected request never writes a file to disk.
 */
export function requireTeamMember(requiredRole: TeamRole = 'member') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // team_id is a UUID column: anything else can't be a team, and would make Postgres throw
    const { teamId } = req.params;
    if (!teamId || !UUID_PATTERN.test(teamId)) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }

    // Returns null when not a member, or when the lookup fails (fail closed)
    const membership = await getUserTeamRole(userId, teamId);
    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this team' });
    }

    if (requiredRole === 'admin' && membership.role !== 'admin') {
      return res.status(403).json({ error: 'Team admin role required' });
    }

    next();
  };
}
