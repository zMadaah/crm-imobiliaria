import { EventEmitter } from 'node:events';

export type NotificationEvent = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  leadId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type RealtimeEvent = { event: string; data: unknown };

/**
 * Canal interno entre quem produz eventos (notificações, mensagens novas)
 * e as conexões abertas do painel, separado por usuário.
 */
class RealtimeBus extends EventEmitter {
  publish(userId: string, event: string, data: unknown) {
    this.emit(`user:${userId}`, { event, data } satisfies RealtimeEvent);
  }

  subscribe(userId: string, listener: (event: RealtimeEvent) => void): () => void {
    this.on(`user:${userId}`, listener);
    return () => this.off(`user:${userId}`, listener);
  }
}

export const realtimeBus = new RealtimeBus();
realtimeBus.setMaxListeners(0);
