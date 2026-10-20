import type { WaMessage } from './webhook.types';

export type ExtractedOrigin = {
  source: 'REF_CODE' | 'CTWA_AD';
  post: string;
};

/**
 * Código REF do link do post. Aceita "REF-042", "ref 042", "REF042", "Ref#A12".
 * O código precisa ter ao menos um dígito, para não confundir com palavras
 * como "referência".
 */
const REF_PATTERN = /\bref[\s\-_#:.]*([a-z]{0,4}\d[a-z0-9]{0,10})\b/i;

const MAX_ORIGIN_LENGTH = 200;

export function extractRefCode(text: string): string | null {
  const match = REF_PATTERN.exec(text);
  if (!match) return null;
  return `REF-${match[1].toUpperCase()}`;
}

/**
 * Descobre de onde o lead veio. Anúncio tem prioridade sobre código no texto,
 * porque o referral é preenchido pela própria Meta.
 */
export function extractOrigin(message: WaMessage): ExtractedOrigin | null {
  const referral = message.referral;
  if (referral) {
    const id = referral.source_id ?? referral.ctwa_clid ?? 'sem-id';
    const headline = referral.headline?.trim();
    const post = headline ? `AD-${id} (${headline})` : `AD-${id}`;
    return { source: 'CTWA_AD', post: post.slice(0, MAX_ORIGIN_LENGTH) };
  }

  const text = message.text?.body;
  if (text) {
    const code = extractRefCode(text);
    if (code) return { source: 'REF_CODE', post: code };
  }

  return null;
}
