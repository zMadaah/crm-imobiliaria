import type { WaMessage } from './webhook.types';

export type MessageContent = {
  body: string | null;
  mediaId: string | null;
};

/** Normaliza o conteúdo dos diferentes tipos de mensagem do WhatsApp. */
export function extractMessageContent(message: WaMessage): MessageContent {
  switch (message.type) {
    case 'text':
      return { body: message.text?.body ?? null, mediaId: null };

    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const media = message[message.type];
      return {
        body: media?.caption ?? media?.filename ?? null,
        mediaId: media?.id ?? null,
      };
    }

    case 'button':
      return { body: message.button?.text ?? null, mediaId: null };

    case 'interactive': {
      const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
      return { body: reply?.title ?? null, mediaId: null };
    }

    default:
      return { body: null, mediaId: null };
  }
}

/** O WhatsApp já envia só dígitos, mas garantimos o formato antes de gravar. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}
