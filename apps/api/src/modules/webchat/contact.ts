/** Validação do nome e do WhatsApp digitados na página de atendimento. Funções puras. */

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_NAME = 60;

export function checkName(raw: string): Checked<string> {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return { ok: false, error: 'Me diga seu nome, por favor.' };
  if (name.length > MAX_NAME) return { ok: false, error: 'Pode ser só o primeiro nome e o sobrenome.' };
  if (!/\p{L}/u.test(name) || /\d{3,}/.test(name)) return { ok: false, error: 'Esse nome não parece certo. Pode digitar de novo?' };
  return { ok: true, value: name };
}

/** DDDs válidos no Brasil. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Celular brasileiro → formato internacional só com dígitos (5561999998888).
 * Aceita "(61) 99999-8888", "61999998888", "+55 61 99999-8888".
 */
export function checkMobile(raw: string): Checked<string> {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith('0')) digits = digits.slice(1);

  const example = 'Digite o DDD e o número, por exemplo (61) 99999-8888.';
  if (digits.length !== 11) return { ok: false, error: `Esse número está incompleto. ${example}` };
  if (!DDDS.has(Number(digits.slice(0, 2)))) return { ok: false, error: `Esse DDD não existe. ${example}` };
  if (digits[2] !== '9') return { ok: false, error: `Precisa ser um celular com WhatsApp. ${example}` };
  if (/^(\d)\1+$/.test(digits.slice(2))) return { ok: false, error: `Esse número não parece real. ${example}` };
  return { ok: true, value: `55${digits}` };
}

/** Código do anúncio que vem no endereço (?anuncio=REF-101 ou ?anuncio=101). */
export function normalizeAdCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  if (/^\d{1,10}$/.test(value)) return `REF-${value}`;
  const match = /^REF[\s\-_]*([A-Z0-9]{1,15})$/.exec(value);
  if (match) return `REF-${match[1]}`;
  return /^[A-Z0-9-]{1,30}$/.test(value) ? value : null;
}
