import { Router } from 'express';
import { env } from '../../config/env';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { whatsappStatus } from '../health/health';
import { buildWaLink, formatBusinessNumber } from '../whatsapp/business-number';

/** Configuração do WhatsApp para o painel (só o dono). Nunca devolve token nem segredo. */
export const settingsRouter = Router();
settingsRouter.use(requireAuth, requireRole('OWNER'));

settingsRouter.get('/whatsapp', (_req, res) => {
  const number = env.WHATSAPP_BUSINESS_NUMBER;
  res.json({
    number: number ?? null,
    numberFormatted: number ? formatBusinessNumber(number) : null,
    waLink: number ? buildWaLink(number) : null,
    status: whatsappStatus(env),
  });
});
