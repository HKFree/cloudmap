import type { MapData, Revision, RevisionSummary, SaveChanges } from '@cloudmap/shared';

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
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? `Požadavek selhal (HTTP ${response.status})`, response.status);
  }
  return response.json();
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const fetchMap = (revision?: number | null) => request<MapData>(`/api/v1/map${revision ? `?revision=${revision}` : ''}`);

export const fetchRevisions = () => request<RevisionSummary[]>('/api/v1/revisions');

export const saveChanges = (changes: SaveChanges) => post<Revision>('/api/v1/changes', changes);

export const restoreRevision = (id: number) => post<Revision>(`/api/v1/revisions/${id}/restore`, {});
