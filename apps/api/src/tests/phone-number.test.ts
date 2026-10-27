import { describe, expect, it } from 'vitest';
import { isConfiguredNumber } from '../modules/whatsapp/phone-number';

describe('isConfiguredNumber', () => {
  it('atende o número configurado', () => expect(isConfiguredNumber('111', '111')).toBe(true));
  it('ignora outro número da mesma conta', () => expect(isConfiguredNumber('222', '111')).toBe(false));
  it('ignora mensagem sem o ID do número quando há um configurado', () => expect(isConfiguredNumber(undefined, '111')).toBe(false));
  it('sem número configurado (modo de teste) aceita todos', () => {
    expect(isConfiguredNumber('qualquer', undefined)).toBe(true);
    expect(isConfiguredNumber('qualquer', '')).toBe(true);
  });
});
