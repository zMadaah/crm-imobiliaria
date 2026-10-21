import { describe, expect, it } from 'vitest';
import { buildWaLink, formatBusinessNumber, normalizeBusinessNumber } from '../modules/whatsapp/business-number';

describe('normalizeBusinessNumber', () => {
  it.each(['5561998665922', '+55 61 99866-5922', '+55 (61) 99866-5922', '55 61 998665922'])('aceita "%s"', (raw) => {
    expect(normalizeBusinessNumber(raw)).toBe('5561998665922');
  });

  it('aceita fixo com 8 dígitos', () => expect(normalizeBusinessNumber('556133334444')).toBe('556133334444'));

  it('recusa sem o 55 e DDD', () => {
    expect(() => normalizeBusinessNumber('61998665922')).toThrow('Use o número com 55, DDD e número');
    expect(() => normalizeBusinessNumber('998665922')).toThrow();
  });

  it('recusa outro país', () => expect(() => normalizeBusinessNumber('1415555012345')).toThrow('começar com 55'));
});

describe('formatBusinessNumber', () => {
  it('celular', () => expect(formatBusinessNumber('5561998665922')).toBe('+55 61 99866-5922'));
  it('fixo', () => expect(formatBusinessNumber('556133334444')).toBe('+55 61 3333-4444'));
});

describe('buildWaLink', () => {
  it('sem mensagem', () => expect(buildWaLink('5561998665922')).toBe('https://wa.me/5561998665922'));

  it('com mensagem acentuada', () => {
    expect(buildWaLink('5561998665922', 'Olá! Vi o anúncio REF-101')).toBe(
      'https://wa.me/5561998665922?text=Ol%C3%A1!%20Vi%20o%20an%C3%BAncio%20REF-101',
    );
  });
});
