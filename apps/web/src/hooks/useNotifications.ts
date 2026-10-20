import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useCallback, useEffect, useState } from 'react';
import { API_URL, apiFetch, SESSION_EXPIRED_EVENT, tokenStorage } from '../lib/api';
import type { AppNotification } from '../lib/types';

class FatalStreamError extends Error {}

/**
 * Lista de notificações + conexão aberta (Server-Sent Events) que recebe novas na hora.
 * Se a conexão cair, a biblioteca reconecta sozinha.
 */
export function useNotifications(
  onNew?: (notification: AppNotification) => void,
  onEvent?: (event: string, data: unknown) => void,
) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const data = await apiFetch<{ items: AppNotification[]; unreadCount: number }>('/notifications');
    setItems(data.items);
    setUnreadCount(data.unreadCount);
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);

    const controller = new AbortController();
    void fetchEventSource(`${API_URL}/notifications/stream`, {
      headers: { Authorization: `Bearer ${tokenStorage.get() ?? ''}` },
      signal: controller.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.status === 401) {
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
          throw new FatalStreamError();
        }
        // Ao reconectar, busca o que pode ter chegado enquanto estava fora.
        if (response.ok) void refresh().catch(() => undefined);
      },
      onmessage(event) {
        if (event.event !== 'notification') {
          if (event.event && event.data) onEvent?.(event.event, JSON.parse(event.data));
          return;
        }
        const notification = JSON.parse(event.data) as AppNotification;
        setItems((current) => [notification, ...current.filter((n) => n.id !== notification.id)].slice(0, 30));
        setUnreadCount((count) => count + 1);
        onNew?.(notification);
      },
      onerror(error) {
        if (error instanceof FatalStreamError) throw error;
        return 5_000; // tenta de novo em 5 segundos
      },
    }).catch(() => undefined);

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    setItems((current) => current.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    const { updated } = await apiFetch<{ updated: number }>(`/notifications/${id}/read`, { method: 'PATCH' });
    if (updated > 0) setUnreadCount((count) => Math.max(0, count - updated));
  }, []);

  const markAllRead = useCallback(async () => {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    setItems((current) => current.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  return { items, unreadCount, markRead, markAllRead };
}
