/**
 * Conversa com o bot pelo terminal, sem a Meta.
 *
 * Pré-requisitos: API rodando (npm run dev) com WHATSAPP_DRY_RUN=true.
 *
 * Uso:
 *   npm run chat
 *   npm run chat -- --from 5561988887777
 *   npm run chat -- --anuncio 120211111111111111
 *   npm run chat -- --anuncio 120211111111111111 --titulo "Apto 3 quartos Torre A"
 *
 * --anuncio simula um cliente vindo de um anúncio Click-to-WhatsApp: a primeira
 * mensagem leva o ID do anúncio, como a Meta faz.
 *
 * Digite o número de uma opção para "tocar" no botão, ou qualquer texto
 * para simular uma mensagem digitada. "sair" encerra.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';
import { renderStep, type InteractiveChoice } from '../src/modules/bot/bot-engine';
import { isStepKey, type BotContext } from '../src/modules/bot/qualification-flow';
import { originLabel } from '../src/modules/leads/lead-origin';
import { signPayload } from '../src/modules/whatsapp/signature';
import type { WaMessage } from '../src/modules/whatsapp/webhook.types';

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const secret = process.env.WHATSAPP_APP_SECRET ?? '';
const url = `http://localhost:${process.env.PORT ?? 3333}/webhooks/whatsapp`;
const phone = getArg('--from') ?? `55619${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
const adId = getArg('--anuncio');
const adTitle = getArg('--titulo') ?? (adId ? `Anúncio de teste ${adId}` : undefined);
// Mesmo ID do .env: com ele preenchido, o webhook só atende esse número.
const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || 'SIMULADOR';
let firstMessage = true;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postMessage(message: WaMessage) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_SIMULADOR',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: process.env.WHATSAPP_BUSINESS_NUMBER || '15550000000', phone_number_id: phoneNumberId },
              contacts: [{ wa_id: phone, profile: { name: 'Cliente Simulado' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
  const body = JSON.stringify(payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signPayload(body, secret) },
    body,
  });
  if (!response.ok) throw new Error(`Webhook respondeu ${response.status}`);
}

function baseMessage() {
  const base = { id: `wamid.SIM_${randomUUID()}`, from: phone, timestamp: String(Math.floor(Date.now() / 1000)) };
  // A Meta só manda os dados do anúncio na primeira mensagem da conversa.
  if (firstMessage && adId) {
    firstMessage = false;
    return { ...base, referral: { source_id: adId, source_type: 'ad', headline: adTitle, ctwa_clid: `SIM_${adId}` } };
  }
  firstMessage = false;
  return base;
}

type Outbound = { id: string; body: string | null; sentBy: { name: string } | null };

async function outboundSince(since: Date): Promise<Outbound[]> {
  const lead = await prisma.lead.findUnique({ where: { phone }, select: { id: true } });
  if (!lead) return [];
  return prisma.message.findMany({
    where: { leadId: lead.id, direction: 'OUTBOUND', createdAt: { gt: since } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, body: true, sentBy: { select: { name: true } } },
  });
}

/** Espera o bot responder e devolve as mensagens novas. */
async function waitForBot(since: Date): Promise<Outbound[]> {
  let messages: Outbound[] = [];
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const current = await outboundSince(since);
    if (current.length > 0 && current.length === messages.length) break; // estabilizou
    messages = current;
  }
  return messages;
}

const printed = new Set<string>();

function printOutbound(messages: Outbound[]) {
  for (const message of messages) {
    if (printed.has(message.id)) continue;
    printed.add(message.id);
    const who = message.sentBy ? `Corretor (${message.sentBy.name})` : 'Bot';
    console.log(`\n${who}: ${(message.body ?? '').replace(/\n/g, '\n     ')}\n`);
  }
}

async function currentChoices(): Promise<{ status: string; kind: 'button_reply' | 'list_reply'; choices: InteractiveChoice[] } | null> {
  const lead = await prisma.lead.findUnique({ where: { phone }, include: { botSession: true } });
  const session = lead?.botSession;
  if (!session) return null;
  if (session.status !== 'ACTIVE' || !isStepKey(session.currentStep)) {
    return { status: session.status, kind: 'button_reply', choices: [] };
  }
  const rendered = renderStep(session.currentStep, session.context as unknown as BotContext);
  if (rendered.type === 'buttons') return { status: 'ACTIVE', kind: 'button_reply', choices: rendered.buttons };
  if (rendered.type === 'list') return { status: 'ACTIVE', kind: 'list_reply', choices: rendered.rows };
  return { status: 'ACTIVE', kind: 'button_reply', choices: [] };
}

async function printSummary() {
  const lead = await prisma.lead.findUnique({
    where: { phone },
    include: {
      answers: { orderBy: { createdAt: 'asc' } },
      broker: { select: { name: true } },
      ad: { select: { name: true, headline: true, propertyReference: true } },
      visits: { where: { status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' } },
    },
  });
  if (!lead) return;
  console.log('\n──────── Resumo ────────');
  console.log(`Lead: ${lead.name ?? '-'} (${lead.phone})`);
  console.log(`Origem: ${originLabel(lead)}${lead.originRef ? `  |  Código: ${lead.originRef}` : ''}`);
  console.log(`Etapa: ${lead.stage}  |  Corretor: ${lead.broker?.name ?? 'nenhum'}`);
  const temperature = { HOT: 'quente', WARM: 'morno', COLD: 'frio' } as const;
  console.log(`Score: ${lead.score}  |  Temperatura: ${lead.temperature ? temperature[lead.temperature] : '-'}`);
  for (const answer of lead.answers) {
    console.log(`  ${answer.questionKey}: ${answer.answerLabel} (${answer.points} pts)`);
  }
  for (const visit of lead.visits) {
    console.log(`Visita marcada: ${visit.scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  }
}

async function main() {
  if (process.env.WHATSAPP_DRY_RUN === 'false') {
    console.error('Use WHATSAPP_DRY_RUN=true no .env para simular (e reinicie a API).');
    process.exit(1);
  }

  const rl = createInterface({ input, output });
  console.log(`Simulando o cliente ${phone}${adId ? `, vindo do anúncio ${adId}` : ''}. Digite "sair" para encerrar.\n`);

  let choices: InteractiveChoice[] = [];
  let kind: 'button_reply' | 'list_reply' = 'button_reply';
  let botFinished = false;
  let lastCheck = new Date();

  // Depois que o bot termina, respostas do corretor pelo painel aparecem aqui.
  const poller = setInterval(async () => {
    if (!botFinished) return;
    const since = lastCheck;
    lastCheck = new Date();
    try {
      const fresh = (await outboundSince(since)).filter((m) => !printed.has(m.id));
      if (fresh.length > 0) {
        printOutbound(fresh);
        rl.prompt(true);
      }
    } catch {
      /* banco indisponível por um instante: tenta no próximo ciclo */
    }
  }, 1_500);

  while (true) {
    const typed = (await rl.question('Você: ')).trim();
    if (!typed) continue;
    if (typed.toLowerCase() === 'sair') break;

    const index = Number(typed) - 1;
    const choice = !botFinished && Number.isInteger(index) && choices[index] ? choices[index] : null;
    const message: WaMessage = choice
      ? {
          ...baseMessage(),
          type: 'interactive',
          interactive:
            kind === 'list_reply'
              ? { type: 'list_reply', list_reply: { id: choice.id, title: choice.title } }
              : { type: 'button_reply', button_reply: { id: choice.id, title: choice.title } },
        }
      : { ...baseMessage(), type: 'text', text: { body: typed } };

    if (choice) console.log(`      (tocou em "${choice.title}")`);

    const since = new Date();
    await postMessage(message);
    if (botFinished) continue; // agora quem responde é o corretor, pelo painel

    printOutbound(await waitForBot(since));

    const state = await currentChoices();
    if (!state || state.status !== 'ACTIVE') {
      botFinished = true;
      lastCheck = new Date();
      if (state) console.log(`🔚 Bot encerrado com status ${state.status}.`);
      await printSummary();
      console.log('\nA conversa continua: responda pelo painel e a mensagem aparece aqui.');
      console.log('Você pode seguir escrevendo como cliente. Digite "sair" para encerrar.\n');
      continue;
    }
    choices = state.choices;
    kind = state.kind;
    choices.forEach((c, i) => console.log(`   ${i + 1}) ${c.title}${c.description ? `  (${c.description})` : ''}`));
    console.log('');
  }

  clearInterval(poller);
  rl.close();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
