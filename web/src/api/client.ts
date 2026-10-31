import { telegramInitData } from '@web/telegram';

// The one way the SPA talks to /api (API.md). Inside Telegram every request carries
// `Authorization: tma <initData>`; in a browser the __Host-session cookie goes along by itself (same origin).
// `X-Requested-With: fetch` is always sent: the server requires it on cookie requests that change state (CSRF).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API ${status} ${code}`);
    this.name = 'ApiError';
  }
}

export async function api<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'x-requested-with': 'fetch' };
  const initData = telegramInitData();
  if (initData) headers.authorization = `tma ${initData}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`);
  }
  return (await res.json()) as T;
}
