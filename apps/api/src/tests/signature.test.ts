import { describe, expect, it } from 'vitest';
import { isValidSignature, signPayload } from '../modules/whatsapp/signature';

const SECRET = 'segredo-de-teste';
const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));

describe('isValidSignature', () => {
  it('aceita assinatura correta', () => {
    expect(isValidSignature(body, signPayload(body, SECRET), SECRET)).toBe(true);
  });

  it('rejeita corpo alterado', () => {
    const signature = signPayload(body, SECRET);
    expect(isValidSignature(Buffer.from('{"object":"outro"}'), signature, SECRET)).toBe(false);
  });

  it('rejeita secret diferente', () => {
    expect(isValidSignature(body, signPayload(body, 'outro-secret'), SECRET)).toBe(false);
  });

  it.each([undefined, '', 'sha1=abc', 'sha256=naoehex', 'sha256=abcd'])('rejeita header inválido: %s', (header) => {
    expect(isValidSignature(body, header, SECRET)).toBe(false);
  });
});
