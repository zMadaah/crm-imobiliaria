import { describe, expect, it } from 'vitest';
import { originLabel, suggestedPropertyReference, type OriginInput } from '../modules/leads/lead-origin';

const base: OriginInput = { originSource: 'UNKNOWN', originPost: null, originAdId: null, originRef: null, ad: null };
const fromAd = (ad: OriginInput['ad'], extra: Partial<OriginInput> = {}): OriginInput => ({
  ...base,
  originSource: 'CTWA_AD',
  originPost: 'AD-111 (Título da Meta)',
  originAdId: '111',
  ad,
  ...extra,
});

describe('originLabel', () => {
  it('anúncio com nome dado pelo dono', () => {
    expect(originLabel(fromAd({ name: 'Apto 3 quartos Torre A', headline: 'Título da Meta', propertyReference: null }))).toBe(
      'Anúncio: Apto 3 quartos Torre A',
    );
  });
  it('anúncio sem nome usa o título da Meta', () => {
    expect(originLabel(fromAd({ name: null, headline: 'Título da Meta', propertyReference: null }))).toBe('Anúncio: Título da Meta');
  });
  it('anúncio sem nome nem título mostra o ID', () => {
    expect(originLabel(fromAd({ name: null, headline: null, propertyReference: null }))).toBe('Anúncio 111');
  });
  it('post com código', () => {
    expect(originLabel({ ...base, originSource: 'REF_CODE', originPost: 'REF-042', originRef: 'REF-042' })).toBe('Post REF-042');
  });
  it('sem origem', () => expect(originLabel(base)).toBe('Origem não identificada'));
});

describe('suggestedPropertyReference', () => {
  it('código digitado tem prioridade sobre o do anúncio', () => {
    expect(suggestedPropertyReference(fromAd({ name: null, headline: null, propertyReference: 'TORRE-A' }, { originRef: 'REF-101' }))).toBe('REF-101');
  });
  it('sem código, usa o imóvel cadastrado no anúncio', () => {
    expect(suggestedPropertyReference(fromAd({ name: null, headline: null, propertyReference: 'TORRE-A' }))).toBe('TORRE-A');
  });
  it('lead antigo de post usa o código da origem', () => {
    expect(suggestedPropertyReference({ ...base, originSource: 'REF_CODE', originPost: 'REF-042' })).toBe('REF-042');
  });
});
