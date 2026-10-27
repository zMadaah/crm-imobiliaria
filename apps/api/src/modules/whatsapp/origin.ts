import type { WaMessage } from './webhook.types';

export type ExtractedOrigin = {
  source: 'REF_CODE' | 'CTWA_AD';
  /** Texto legado da origem: "AD-<id> (<título>)" ou "REF-042" */
  post: string;
  adId: string | null;
  adHeadline: string | null;
  /** Código REF da mensagem, mesmo quando ela veio de anúncio */
  refCode: string | null;
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
 * Descobre de onde o lead veio. Anúncio define a origem (o referral é preenchido pela
 * própria Meta); o código REF digitado é guardado junto, como referência do imóvel.
 */
export function extractOrigin(message: WaMessage): ExtractedOrigin | null {
  const text = message.text?.body;
  const refCode = text ? extractRefCode(text) : null;

  const referral = message.referral;
  if (referral) {
    const adId = (referral.source_id ?? referral.ctwa_clid ?? 'sem-id').trim();
    const headline = referral.headline?.trim() || null;
    const post = headline ? `AD-${adId} (${headline})` : `AD-${adId}`;
    return {
      source: 'CTWA_AD',
      post: post.slice(0, MAX_ORIGIN_LENGTH),
      adId: adId.slice(0, MAX_ORIGIN_LENGTH),
      adHeadline: headline?.slice(0, MAX_ORIGIN_LENGTH) ?? null,
      refCode,
    };
  }

  if (refCode) return { source: 'REF_CODE', post: refCode, adId: null, adHeadline: null, refCode };
  return null;
}
