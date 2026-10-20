import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth } from './auth.middleware';
import { signToken } from './jwt';
import { clearAttempts, isBlocked, registerFailedAttempt } from './login-rate-limit';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const ip = req.ip ?? 'desconhecido';
  if (isBlocked(ip)) {
    res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Informe e-mail e senha.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user?.active ? await bcrypt.compare(parsed.data.password, user.passwordHash) : false;

  if (!user || !valid) {
    registerFailedAttempt(ip);
    res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    return;
  }

  clearAttempts(ip);
  res.json({
    token: signToken({ sub: user.id, role: user.role }),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
