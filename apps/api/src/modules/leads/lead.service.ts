import { Prisma, type Lead, type LeadChannel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { ExtractedOrigin } from '../whatsapp/origin';

type FindOrCreateInput = {
  phone: string;
  name?: string | null;
  origin: ExtractedOrigin | null;
  /** Canal gravado só na criação do lead */
  channel?: LeadChannel;
};

type FindOrCreateResult = {
  lead: Lead;
  created: boolean;
};

/**
 * Busca o lead pelo telefone ou cria um novo na etapa NEW, com registro no histórico.
 *
 * Regras de origem (primeiro toque):
 * - a origem só é gravada se o lead ainda não tiver uma;
 * - mensagens seguintes nunca sobrescrevem a origem existente.
 */
export async function findOrCreateLeadByPhone(input: FindOrCreateInput): Promise<FindOrCreateResult> {
  const existing = await prisma.lead.findUnique({ where: { phone: input.phone } });
  if (existing) {
    return { lead: await fillMissingData(existing, input), created: false };
  }

  await ensureAd(input.origin);

  try {
    const lead = await prisma.lead.create({
      data: {
        phone: input.phone,
        name: input.name ?? null,
        channel: input.channel ?? 'WHATSAPP',
        originPost: input.origin?.post ?? null,
        originSource: input.origin?.source ?? 'UNKNOWN',
        originAdId: input.origin?.adId ?? null,
        originRef: input.origin?.refCode ?? null,
        stage: 'NEW',
        stageHistory: { create: { fromStage: null, toStage: 'NEW' } },
      },
    });
    return { lead, created: true };
  } catch (error) {
    // Duas mensagens do mesmo número novo chegaram juntas: o outro processo criou primeiro.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const lead = await prisma.lead.findUniqueOrThrow({ where: { phone: input.phone } });
      return { lead: await fillMissingData(lead, input), created: false };
    }
    throw error;
  }
}

async function fillMissingData(lead: Lead, input: FindOrCreateInput): Promise<Lead> {
  const data: Prisma.LeadUpdateInput = {};

  if (!lead.name && input.name) data.name = input.name;

  if (!lead.originPost && input.origin) {
    await ensureAd(input.origin);
    data.originPost = input.origin.post;
    data.originSource = input.origin.source;
    if (input.origin.adId) data.ad = { connect: { adId: input.origin.adId } };
  }
  if (!lead.originRef && input.origin?.refCode) data.originRef = input.origin.refCode;

  if (Object.keys(data).length === 0) return lead;
  return prisma.lead.update({ where: { id: lead.id }, data });
}

/** Cria o anúncio na primeira vez que ele traz um lead; o dono dá o nome depois, no painel. */
async function ensureAd(origin: ExtractedOrigin | null): Promise<void> {
  if (!origin?.adId) return;
  await prisma.ad.upsert({
    where: { adId: origin.adId },
    create: { adId: origin.adId, headline: origin.adHeadline },
    update: {},
  });
}
