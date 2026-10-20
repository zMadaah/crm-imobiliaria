import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { authRouter } from './modules/auth/auth.routes';
import { leadsRouter } from './modules/leads/leads.routes';
import { visitsRouter } from './modules/visits/visits.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { scoreWeightsRouter } from './modules/scoring/score-weights.routes';
import { syncDefaultWeights } from './modules/scoring/scoring.service';
import { startEventProcessor, stopEventProcessor } from './modules/whatsapp/event-processor';
import { whatsappWebhookRouter } from './modules/whatsapp/webhook.routes';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render fica atrás de proxy; necessário para req.ip correto

// O webhook precisa do corpo bruto para validar a assinatura,
// então é registrado ANTES do express.json() e sem CORS.
app.use('/webhooks/whatsapp', whatsappWebhookRouter);

app.use(cors({ origin: env.WEB_ORIGIN.split(',').map((origin) => origin.trim()) }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/score-weights', scoreWeightsRouter);
app.use('/notifications', notificationsRouter);
app.use('/leads', leadsRouter);
app.use('/visits', visitsRouter);
app.use('/reports', reportsRouter);

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error('[api] erro não tratado', error);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
};
app.use(errorHandler);

async function start() {
  try {
    const created = await syncDefaultWeights();
    if (created > 0) console.log(`Pesos padrão criados: ${created}`);
  } catch (error) {
    console.error('Falha ao criar os pesos padrão', error);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`API rodando na porta ${env.PORT}`);
    startEventProcessor();
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} recebido, encerrando...`);
    stopEventProcessor();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Conexões de notificação ficam abertas; não esperar por elas para sempre.
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();
