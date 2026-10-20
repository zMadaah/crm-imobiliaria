/** Limite simples de tentativas de login por IP (memória, uma instância). */
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function registerFailedAttempt(ip: string): void {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
}

export function isBlocked(ip: string): boolean {
  const current = attempts.get(ip);
  if (!current) return false;
  if (current.resetAt < Date.now()) {
    attempts.delete(ip);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}
