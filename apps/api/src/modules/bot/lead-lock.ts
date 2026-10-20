/**
 * Fila por lead: mensagens do mesmo lead são processadas uma de cada vez,
 * para o bot não pular pergunta quando a pessoa manda duas mensagens juntas.
 *
 * Funciona com UMA instância do servidor. Com várias instâncias, trocar por
 * trava no banco (pg_advisory_xact_lock).
 */
const queues = new Map<string, Promise<unknown>>();

export function withLeadLock<T>(leadId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(leadId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);

  queues.set(leadId, current);
  current
    .finally(() => {
      if (queues.get(leadId) === current) queues.delete(leadId);
    })
    .catch(() => undefined);

  return current;
}
