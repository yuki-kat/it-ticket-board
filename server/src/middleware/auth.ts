import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth.js';

export interface AuthRequest extends Request {
  user?: {
    user_id: string;
    email: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Missing authentication token' });
    }

    // Support demo mode token for local development
    if (token === 'local-token') {
      req.user = { user_id: 'local-user', email: 'user@local.example.com' };
      return next();
    }

    // Verify real JWT token from Supabase or local auth
    const payload = verifyToken(token);
    req.user = { user_id: payload.user_id, email: payload.email };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
