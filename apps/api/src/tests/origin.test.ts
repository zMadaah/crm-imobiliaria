import { describe, expect, it } from 'vitest';
import { extractOrigin, extractRefCode } from '../modules/whatsapp/origin';
import type { WaMessage } from '../modules/whatsapp/webhook.types';
import ctwaAd from './fixtures/ctwa-ad.json';
import textRef from './fixtures/text-ref.json';

function textMessage(body: string, extra: Partial<WaMessage> = {}): WaMessage {
  return { id: 'wamid.x', from: '5561999990000', timestamp: '1790000000', type: 'text', text: { body }, ...extra };
}

describe('extractRefCode', () => {
  it.each([
    ['Vi o imóvel REF-042', 'REF-042'],
    ['quero saber do ref 042', 'REF-042'],
    ['REF042 ainda está disponível?', 'REF-042'],
    ['Ref#a12', 'REF-A12'],
    ['código: REF_7', 'REF-7'],
  ])('reconhece "%s"', (text, expected) => {
    expect(extractRefCode(text)).toBe(expected);
  });

  it.each([
    'Tenho interesse, qual a referência?',
    'referencia do imovel',
    'Preferência por 2 quartos',
    'Olá, bom dia',
  ])('ignora "%s"', (text) => {
    expect(extractRefCode(text)).toBeNull();
  });

  it('acha o código mesmo depois da palavra referência', () => {
    expect(extractRefCode('A referência é REF-099')).toBe('REF-099');
  });
});

describe('extractOrigin', () => {
  it('usa o código REF do texto do post', () => {
    const message = textRef.entry[0].changes[0].value.messages[0] as WaMessage;
    expect(extractOrigin(message)).toEqual({ source: 'REF_CODE', post: 'REF-042' });
  });

  it('usa o referral quando vem de anúncio', () => {
    const message = ctwaAd.entry[0].changes[0].value.messages[0] as WaMessage;
    expect(extractOrigin(message)).toEqual({
      source: 'CTWA_AD',
      post: 'AD-120211111111111111 (Casa 3 quartos no Lago Norte)',
    });
  });

  it('anúncio tem prioridade sobre REF no texto', () => {
    const message = textMessage('Vi o REF-042', { referral: { source_id: '999' } });
    expect(extractOrigin(message)).toEqual({ source: 'CTWA_AD', post: 'AD-999' });
  });

  it('retorna null sem origem identificável', () => {
    expect(extractOrigin(textMessage('Boa tarde'))).toBeNull();
  });
});
