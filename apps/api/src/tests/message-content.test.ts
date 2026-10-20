import { describe, expect, it } from 'vitest';
import { extractMessageContent, normalizePhone } from '../modules/whatsapp/message-content';
import type { WaMessage } from '../modules/whatsapp/webhook.types';

const base = { id: 'wamid.x', from: '5561999990000', timestamp: '1790000000' };

describe('extractMessageContent', () => {
  it('texto', () => {
    expect(extractMessageContent({ ...base, type: 'text', text: { body: 'oi' } })).toEqual({ body: 'oi', mediaId: null });
  });

  it('imagem com legenda', () => {
    const message: WaMessage = { ...base, type: 'image', image: { id: 'MEDIA1', caption: 'minha casa' } };
    expect(extractMessageContent(message)).toEqual({ body: 'minha casa', mediaId: 'MEDIA1' });
  });

  it('resposta de botão interativo', () => {
    const message: WaMessage = {
      ...base,
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'buy', title: 'Comprar' } },
    };
    expect(extractMessageContent(message)).toEqual({ body: 'Comprar', mediaId: null });
  });

  it('tipo desconhecido', () => {
    expect(extractMessageContent({ ...base, type: 'location' })).toEqual({ body: null, mediaId: null });
  });
});

describe('normalizePhone', () => {
  it('mantém só dígitos', () => {
    expect(normalizePhone('+55 (61) 99999-0000')).toBe('5561999990000');
  });
});
