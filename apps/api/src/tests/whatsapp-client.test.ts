import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({ env: { WHATSAPP_DRY_RUN: true } }));

import { toCloudApiPayload } from '../modules/whatsapp/whatsapp.client';

describe('toCloudApiPayload', () => {
  it('texto', () => {
    expect(toCloudApiPayload('5561999990000', { type: 'text', body: 'oi' })).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5561999990000',
      type: 'text',
      text: { body: 'oi', preview_url: false },
    });
  });

  it('botões', () => {
    const payload = toCloudApiPayload('5561999990000', {
      type: 'buttons',
      body: 'Comprar ou alugar?',
      buttons: [{ id: 'intent:buy', title: 'Comprar' }],
    }) as any;
    expect(payload.interactive.type).toBe('button');
    expect(payload.interactive.action.buttons[0]).toEqual({ type: 'reply', reply: { id: 'intent:buy', title: 'Comprar' } });
  });

  it('lista', () => {
    const payload = toCloudApiPayload('5561999990000', {
      type: 'list',
      body: 'Região?',
      buttonText: 'Ver opções',
      rows: [{ id: 'region:centro', title: 'Centro' }],
    }) as any;
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.action.button).toBe('Ver opções');
    expect(payload.interactive.action.sections[0].rows[0]).toEqual({ id: 'region:centro', title: 'Centro' });
  });
});
