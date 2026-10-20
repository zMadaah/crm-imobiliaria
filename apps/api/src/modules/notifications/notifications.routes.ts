import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth } from '../auth/auth.middleware';
import { realtimeBus } from './notification-bus';
import { toNotificationEvent } from './notification.service';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

const HEARTBEAT_MS = 25_000;

notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ items: items.map(toNotificationEvent), unreadCount });
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
});

/**
 * Server-Sent Events: o painel mantém esta conexão aberta e recebe na hora
 * notificações ("notification") e mensagens novas dos leads que pode ver ("message").
 */
notificationsRouter.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': conectado\n\n');

  const unsubscribe = realtimeBus.subscribe(req.user!.id, ({ event, data }) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  // Mantém a conexão viva atrás de proxies que derrubam conexões paradas.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
