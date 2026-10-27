import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { answerLimiter, startLimiter } from './public-limits';
import { answerChat, ChatNotFoundError, CHAT_LIMITS, resumeChat, startChat } from './web-chat.service';

/** Rotas da página de atendimento. Públicas: sem login, com limite por aparelho. */
export const webChatRouter = Router();

const TOO_MANY = 'Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente de novo.';
const ipOf = (req: Request) => req.ip ?? 'desconhecido';

const startSchema = z.object({
  anuncio: z.string().max(60).optional().nullable(),
  /** Campo escondido na página: pessoas não veem, robôs preenchem */
  website: z.string().optional().nullable(),
});

webChatRouter.post('/start', async (req, res) => {
  const parsed = startSchema.safeParse(req.body ?? {});
  if (!parsed.success || parsed.data.website) {
    res.status(400).json({ error: 'Não foi possível iniciar o atendimento.' });
    return;
  }
  if (!startLimiter.hit(ipOf(req))) {
    res.status(429).json({ error: TOO_MANY });
    return;
  }
  const { token, view } = await startChat(parsed.data.anuncio);
  res.status(201).json({ token, ...view });
});

const tokenSchema = z.object({ token: z.string().min(20).max(100) });

const answerSchema = tokenSchema.and(
  z.union([
    z.object({ reply: z.string().min(1).max(250) }),
    z.object({ text: z.string().trim().min(1).max(CHAT_LIMITS.MAX_TEXT) }),
  ]),
);

webChatRouter.post('/answer', async (req, res) => {
  const parsed = answerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Escolha uma opção ou escreva uma resposta.' });
    return;
  }
  if (!answerLimiter.hit(ipOf(req))) {
    res.status(429).json({ error: TOO_MANY });
    return;
  }
  const input = 'reply' in parsed.data ? { kind: 'reply' as const, id: parsed.data.reply } : { kind: 'text' as const, text: parsed.data.text };
  await respond(res, () => answerChat(parsed.data.token, input));
});

webChatRouter.post('/resume', async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Atendimento não encontrado.' });
    return;
  }
  await respond(res, () => resumeChat(parsed.data.token));
});

async function respond(res: Response, run: () => Promise<unknown>) {
  try {
    res.json(await run());
  } catch (error) {
    if (error instanceof ChatNotFoundError) {
      res.status(404).json({ error: 'Atendimento não encontrado. Comece de novo.' });
      return;
    }
    throw error;
  }
}
