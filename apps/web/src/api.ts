import type { CurrentUser, MapData, Revision, RevisionSummary, SaveChanges } from '@cloudmap/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 401) handleExpiredLogin(init?.method ?? 'GET');
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? `Požadavek selhal (HTTP ${response.status})`, response.status);
  }
  return response.json();
}

/**
 * Reading sends the browser through the SSO login and back. A failed save must not
 * reload the page, which would throw away the edits, so it only asks to sign in elsewhere.
 */
function handleExpiredLogin(method: string): never {
  if (method === 'GET') {
    const { pathname, search, hash } = window.location;
    window.location.assign(`/auth/login?returnTo=${encodeURIComponent(pathname + search + hash)}`);
    throw new ApiError('Přesměrování na přihlášení…', 401);
  }
  throw new ApiError(
    'Přihlášení vypršelo. Přihlaste se znovu v novém panelu na adrese /auth/login a pak uložte znovu – úpravy zůstanou zachovány.',
    401,
  );
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const fetchMap = (revision?: number | null) => request<MapData>(`/api/v1/map${revision ? `?revision=${revision}` : ''}`);

export const fetchCurrentUser = () => request<CurrentUser>('/api/v1/me');

export const fetchRevisions = () => request<RevisionSummary[]>('/api/v1/revisions');

export const saveChanges = (changes: SaveChanges) => post<Revision>('/api/v1/changes', changes);

export const restoreRevision = (id: number) => post<Revision>(`/api/v1/revisions/${id}/restore`, {});
