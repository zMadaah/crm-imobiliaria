import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../lib/types';

type Listener = (data: unknown) => void;

type NotificationsState = ReturnType<typeof useNotifications> & {
  toast: AppNotification | null;
  dismissToast: () => void;
  /** Recebe eventos em tempo real (ex.: "message"). Devolve a função para cancelar. */
  subscribe: (event: string, listener: Listener) => () => void;
};

const NotificationsContext = createContext<NotificationsState | null>(null);

const TOAST_MS = 8_000;
const BASE_TITLE = document.title;

/** Uma única conexão de notificações para o painel inteiro. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<AppNotification | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((notification: AppNotification) => {
    setToast(notification);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const listeners = useRef(new Map<string, Set<Listener>>());

  const dispatch = useCallback((event: string, data: unknown) => {
    listeners.current.get(event)?.forEach((listener) => listener(data));
  }, []);

  const subscribe = useCallback((event: string, listener: Listener) => {
    const set = listeners.current.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.current.set(event, set);
    return () => set.delete(listener);
  }, []);

  const state = useNotifications(showToast, dispatch);

  useEffect(() => {
    document.title = state.unreadCount > 0 ? `(${state.unreadCount}) ${BASE_TITLE}` : BASE_TITLE;
  }, [state.unreadCount]);

  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <NotificationsContext.Provider value={{ ...state, toast, dismissToast, subscribe }}>{children}</NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): NotificationsState {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotificationsContext precisa estar dentro de NotificationsProvider');
  return context;
}

/** Atalho para ouvir um evento em tempo real enquanto o componente estiver na tela. */
export function useRealtimeEvent<T>(event: string, handler: (data: T) => void) {
  const { subscribe } = useNotificationsContext();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(event, (data) => ref.current(data as T)), [event, subscribe]);
}
