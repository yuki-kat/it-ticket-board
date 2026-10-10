import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { JWTPayload } from '../models/types.js';

// Placeholders that are public in this repo. A token signed with one of them can be forged by anyone.
const PUBLIC_SECRETS = new Set(['dev-secret', 'your-secret-key-change-in-production']);

// Refuse to start in production without a real secret, rather than quietly signing with a public one.
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() || '';
  if (process.env.NODE_ENV === 'production' && (!secret || PUBLIC_SECRETS.has(secret))) {
    throw new Error('JWT_SECRET is missing or set to a public placeholder. Set a long random value in the environment (Render: it-ticket-board-backend → Environment) and deploy again.');
  }
  if (!secret) {
    console.warn('JWT_SECRET is not set; using the insecure development secret. Never do this in production.');
    return 'dev-secret';
  }
  return secret;
}

const JWT_SECRET: Secret = resolveJwtSecret();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user_id: string, email: string): string {
  return jwt.sign(
    { user_id, email },
    JWT_SECRET as string,
    { expiresIn: '24h' }
  );
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
}
