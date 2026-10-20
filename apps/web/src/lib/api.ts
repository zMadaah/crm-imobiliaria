export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3333';

const TOKEN_KEY = 'crm.token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

/** Avisa o app que a sessão caiu (token vencido ou usuário desativado). */
export const SESSION_EXPIRED_EVENT = 'crm:session-expired';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStorage.get();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Confira sua conexão.', 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(data.error ?? 'Algo deu errado. Tente novamente.', response.status, data.details ?? []);
  }
  return data as T;
}

/** Baixa um arquivo protegido (ex.: mídia do WhatsApp) como Blob. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = tokenStorage.get();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error ?? 'Não foi possível carregar o arquivo.', response.status);
  }
  return response.blob();
}
