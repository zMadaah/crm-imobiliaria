import { describe, expect, it } from 'vitest';
import { whatsappStatus } from '../modules/health/health';

const ready = {
  WHATSAPP_DRY_RUN: false,
  WHATSAPP_ACCESS_TOKEN: 'EAAG-token-real',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_APP_SECRET: 'segredo-real',
  WHATSAPP_VERIFY_TOKEN: 'verificacao-real',
};

describe('whatsappStatus', () => {
  it('pronto quando tudo está preenchido', () => {
    expect(whatsappStatus(ready)).toEqual({ mode: 'real', phoneNumberConfigured: true, ready: true, problems: [] });
  });

  it('aponta o que falta no modo real', () => {
    const status = whatsappStatus({ ...ready, WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: undefined });
    expect(status.ready).toBe(false);
    expect(status.problems).toEqual(['WHATSAPP_ACCESS_TOKEN não preenchido', 'WHATSAPP_PHONE_NUMBER_ID não preenchido']);
  });

  it('valores de exemplo do .env.example contam como não preenchidos', () => {
    const status = whatsappStatus({ ...ready, WHATSAPP_APP_SECRET: 'cole-o-app-secret-aqui', WHATSAPP_VERIFY_TOKEN: 'troque-este-token' });
    expect(status.problems).toHaveLength(2);
  });

  it('modo de teste não exige token nem número', () => {
    const status = whatsappStatus({ ...ready, WHATSAPP_DRY_RUN: true, WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: '' });
    expect(status).toMatchObject({ mode: 'teste (não envia para a Meta)', ready: true });
  });

  it('nunca devolve o valor de nenhum segredo', () => {
    const text = JSON.stringify(whatsappStatus(ready));
    for (const secret of Object.values(ready)) if (typeof secret === 'string') expect(text).not.toContain(secret);
  });
});
