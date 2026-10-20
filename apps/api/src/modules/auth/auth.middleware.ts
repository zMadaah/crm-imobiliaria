import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { verifyToken } from './jwt';

/** Exige token válido e usuário ativo. O perfil vem do banco, não do token. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!user || !user.active) {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    return;
  }

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Você não tem permissão para acessar isto.' });
      return;
    }
    next();
  };
}
