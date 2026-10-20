import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env';

type TokenPayload = { sub: string; role: UserRole };

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'object' && typeof decoded.sub === 'string') {
      return { sub: decoded.sub, role: decoded.role as UserRole };
    }
    return null;
  } catch {
    return null;
  }
}
