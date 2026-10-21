/**
 * Número do WhatsApp da empresa (o que o cliente vê e o que vai nos links wa.me).
 * Não é o WHATSAPP_PHONE_NUMBER_ID: aquele é o ID interno que a Meta usa para enviar.
 */

/** "+55 (61) 99866-5922" → "5561998665922". Lança erro com mensagem se for inválido. */
export function normalizeBusinessNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 13) {
    throw new Error('Use o número com 55, DDD e número, ex.: 5561998665922');
  }
  if (!digits.startsWith('55')) throw new Error('O número precisa começar com 55 (Brasil).');
  return digits;
}

/** "5561998665922" → "+55 61 99866-5922" */
export function formatBusinessNumber(digits: string): string {
  const match = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return match ? `+55 ${match[1]} ${match[2]}-${match[3]}` : `+${digits}`;
}

/** Link que abre a conversa no WhatsApp, com a mensagem pronta quando houver. */
export function buildWaLink(digits: string, text?: string): string {
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}
