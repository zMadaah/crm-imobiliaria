import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireRole } from '../auth/auth.middleware';

/** Cadastro de anúncios (só o dono). Os anúncios nascem sozinhos com o primeiro lead. */
export const adsRouter = Router();
adsRouter.use(requireAuth, requireRole('OWNER'));

adsRouter.get('/', async (_req, res) => {
  const ads = await prisma.ad.findMany({
    orderBy: [{ createdAt: 'desc' }],
    include: { _count: { select: { leads: true } } },
  });
  const won = await prisma.deal.groupBy({
    by: ['leadId'],
    where: { result: 'WON', voidedAt: null, lead: { originAdId: { not: null } } },
  });
  const wonLeads = won.length
    ? await prisma.lead.findMany({ where: { id: { in: won.map((w) => w.leadId) } }, select: { originAdId: true } })
    : [];
  const wonByAd = new Map<string, number>();
  for (const lead of wonLeads) if (lead.originAdId) wonByAd.set(lead.originAdId, (wonByAd.get(lead.originAdId) ?? 0) + 1);

  res.json({
    items: ads.map((ad) => ({
      id: ad.id,
      adId: ad.adId,
      headline: ad.headline,
      name: ad.name,
      propertyReference: ad.propertyReference,
      leads: ad._count.leads,
      won: wonByAd.get(ad.adId) ?? 0,
      createdAt: ad.createdAt.toISOString(),
    })),
  });
});

const updateSchema = z.object({
  name: z.string().trim().max(80).nullable(),
  propertyReference: z.string().trim().max(120).nullable(),
});

adsRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Nome até 80 caracteres e imóvel até 120.' });
    return;
  }
  const exists = await prisma.ad.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!exists) {
    res.status(404).json({ error: 'Anúncio não encontrado.' });
    return;
  }
  const ad = await prisma.ad.update({
    where: { id: req.params.id },
    data: { name: parsed.data.name || null, propertyReference: parsed.data.propertyReference || null },
  });
  res.json({ id: ad.id, name: ad.name, propertyReference: ad.propertyReference });
});
