import { env } from '../../config/env';
import type { OutgoingMessage } from '../bot/bot-engine';
import { LIST_SECTION_TITLE } from '../bot/qualification-flow';

type SendResult = { waMessageId: string | null };

/** Converte a mensagem do bot no formato da Cloud API. */
export function toCloudApiPayload(to: string, message: OutgoingMessage): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

  switch (message.type) {
    case 'text':
      return { ...base, type: 'text', text: { body: message.body, preview_url: false } };

    case 'buttons':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.body },
          action: {
            buttons: message.buttons.map((button) => ({
              type: 'reply',
              reply: { id: button.id, title: button.title },
            })),
          },
        },
      };

    case 'list':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: message.body },
          action: {
            button: message.buttonText,
            sections: [
              {
                title: LIST_SECTION_TITLE,
                rows: message.rows.map((row) => ({ id: row.id, title: row.title, ...(row.description ? { description: row.description } : {}) })),
              },
            ],
          },
        },
      };
  }
}

export async function sendWhatsAppMessage(to: string, message: OutgoingMessage): Promise<SendResult> {
  if (env.WHATSAPP_DRY_RUN) {
    logDryRun(to, message);
    return { waMessageId: null };
  }

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toCloudApiPayload(to, message)),
  });

  const data = (await response.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number };
  };

  if (!response.ok) {
    const detail = data.error ? `${data.error.code}: ${data.error.message}` : response.statusText;
    throw new Error(`Falha ao enviar mensagem para a Cloud API (${response.status}) ${detail}`);
  }

  return { waMessageId: data.messages?.[0]?.id ?? null };
}

function logDryRun(to: string, message: OutgoingMessage) {
  const lines = [`[dry-run] para ${to} (${message.type})`, ...message.body.split('\n').map((l) => `  ${l}`)];
  if (message.type === 'buttons') lines.push(...message.buttons.map((b) => `  [ ${b.title} ]`));
  if (message.type === 'list') lines.push(...message.rows.map((r) => `  • ${r.title}${r.description ? ` (${r.description})` : ''}`));
  console.log(lines.join('\n'));
}

export class MediaUnavailableError extends Error {}

/**
 * Baixa uma mídia recebida. A Meta devolve primeiro uma URL temporária,
 * que também exige o token para ser lida.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<Response> {
  if (env.WHATSAPP_DRY_RUN || !env.WHATSAPP_ACCESS_TOKEN) {
    throw new MediaUnavailableError('Mídia indisponível no modo de teste.');
  }
  const headers = { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` };

  const metaResponse = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${mediaId}`, { headers });
  if (!metaResponse.ok) throw new MediaUnavailableError('A mídia não está mais disponível na Meta.');
  const { url } = (await metaResponse.json()) as { url?: string };
  if (!url) throw new MediaUnavailableError('A mídia não está mais disponível na Meta.');

  const fileResponse = await fetch(url, { headers });
  if (!fileResponse.ok || !fileResponse.body) throw new MediaUnavailableError('Não foi possível baixar a mídia.');
  return fileResponse;
}
