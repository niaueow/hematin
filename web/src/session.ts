import { ref } from 'vue';
import { api, ApiError } from '@web/api/client';

// Who is signed in, from GET /api/me. Loaded once and cached; the router guard waits for it.

export type Me = {
  id: string;
  firstName: string | null;
  telegramUsername: string | null;
  role: 'OWNER' | 'MEMBER';
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
};

export const me = ref<Me | null>(null);
let loading: Promise<Me | null> | null = null;

/** The signed-in user, or null when not signed in (401). Other errors propagate. */
export function loadMe(): Promise<Me | null> {
  loading ??= api<Me>('/me')
    .then((user) => (me.value = user))
    .catch((err: unknown) => {
      loading = null;
      if (err instanceof ApiError && err.status === 401) return (me.value = null);
      throw err;
    });
  return loading;
}

/** After POST /api/auth/magic. */
export function setMe(user: Me) {
  me.value = user;
  loading = Promise.resolve(user);
}

export async function logout(all = false) {
  await api(all ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
  me.value = null;
  loading = null;
}
