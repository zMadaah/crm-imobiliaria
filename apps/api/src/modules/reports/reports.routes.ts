import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';
import { LOSS_REASON_LABEL } from '../deals/deal-rules';
import { SCHEDULE } from '../visits/schedule-config';
import { runIndicatorQueries } from './indicators.queries';
import { resolvePeriod } from './period';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole('OWNER'));

reportsRouter.get('/indicators', async (req, res) => {
  let period;
  try {
    period = resolvePeriod(
      {
        preset: req.query.preset as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      },
      new Date(),
      SCHEDULE.timeZone,
    );
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }

  const indicators = await runIndicatorQueries(
    (sql, params) => prisma.$queryRawUnsafe(sql, ...params),
    period.start,
    period.end,
  );

  // Corretores ativos sem fechamento no período aparecem com zero.
  const brokers = await prisma.user.findMany({ where: { role: 'BROKER', active: true }, select: { id: true, name: true } });
  for (const broker of brokers) {
    if (!indicators.byBroker.some((row) => row.brokerId === broker.id)) {
      indicators.byBroker.push({
        brokerId: broker.id,
        brokerName: broker.name,
        sales: 0,
        salesValue: '0.00',
        rentals: 0,
        rentalsValue: '0.00',
      });
    }
  }
  indicators.byBroker.sort((a, b) => Number(b.salesValue) - Number(a.salesValue) || (a.brokerName ?? '').localeCompare(b.brokerName ?? ''));

  res.json({
    period: { preset: period.preset, from: period.from, to: period.to, start: period.start.toISOString(), end: period.end.toISOString() },
    ...indicators,
    lossReasons: indicators.lossReasons.map((row) => ({
      ...row,
      label: LOSS_REASON_LABEL[row.reason as keyof typeof LOSS_REASON_LABEL] ?? row.reason,
    })),
  });
});
