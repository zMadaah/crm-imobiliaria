import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * Valida o header X-Hub-Signature-256 enviado pela Meta.
 * Precisa ser calculado sobre o corpo BRUTO da requisição, antes de qualquer parse.
 */
export function isValidSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(PREFIX)) return false;

  const receivedHex = signatureHeader.slice(PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(receivedHex)) return false;

  const received = Buffer.from(receivedHex, 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();

  return timingSafeEqual(received, expected);
}

/** Gera a assinatura no mesmo formato da Meta. Usado em testes e no script de fixtures. */
export function signPayload(rawBody: Buffer | string, appSecret: string): string {
  return PREFIX + createHmac('sha256', appSecret).update(rawBody).digest('hex');
}
