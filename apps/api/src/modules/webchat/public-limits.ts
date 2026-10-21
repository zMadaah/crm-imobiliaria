/**
 * Limite de uso das rotas públicas por aparelho (IP), em memória.
 * Funciona com uma instância do servidor, que é o caso no Render.
 */
type Counter = { count: number; resetAt: number };

export class RateLimiter {
  private counters = new Map<string, Counter>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Conta um uso. Devolve false quando o limite da janela já foi atingido. */
  hit(key: string, now: number = Date.now()): boolean {
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + this.windowMs });
      this.cleanup(now);
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }

  private cleanup(now: number) {
    if (this.counters.size < 5_000) return;
    for (const [key, counter] of this.counters) if (counter.resetAt <= now) this.counters.delete(key);
  }
}

const HOUR = 60 * 60 * 1000;
// Em produção, limites apertados; no seu computador, folgados para testar à vontade.
const production = process.env.NODE_ENV === 'production';
/** Conversas novas por aparelho por hora */
export const startLimiter = new RateLimiter(production ? 10 : 500, HOUR);
/** Respostas por aparelho por hora */
export const answerLimiter = new RateLimiter(production ? 300 : 5_000, HOUR);
