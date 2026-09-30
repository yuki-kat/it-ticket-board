import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { JWTPayload } from '../models/types.js';

const JWT_SECRET: Secret = (process.env.JWT_SECRET || 'dev-secret') as string;

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
