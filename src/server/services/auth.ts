import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../../types/resqnet.ts';

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  'resqnet-dev-jwt-secret-change-in-production';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export interface JwtUserPayload {
  userId: number;
  email: string;
  role: UserRole;
  fullName: string;
  organizationId: number | null;
}

export function signToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): JwtUserPayload {
  return jwt.verify(token, JWT_SECRET) as JwtUserPayload;
}

export interface AuthenticatedRequest extends Request {
  authUser?: JwtUserPayload;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    req.authUser = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({
        error: `Access denied. Role '${req.authUser.role}' is not authorized for this operation.`,
      });
      return;
    }
    next();
  };
}

// Sliding-window API rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests = 600, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/health') {
      next();
      return;
    }
    const isAiRoute = req.originalUrl.startsWith('/api/ai') || req.path.startsWith('/ai');
    const key = `${req.ip || 'local'}:${isAiRoute ? 'ai' : 'api'}`;
    const limit = isAiRoute ? Math.min(60, maxRequests) : maxRequests;
    const now = Date.now();
    const existing = rateBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (existing.count >= limit) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait briefly before retrying.',
      });
      return;
    }
    existing.count += 1;
    next();
  };
}
