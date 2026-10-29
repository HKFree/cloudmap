import type { MapData } from '@cloudmap/shared';

export async function fetchMap(revision?: number): Promise<MapData> {
  const query = revision ? `?revision=${revision}` : '';
  const response = await fetch(`/api/v1/map${query}`);
  if (!response.ok) throw new Error(`Načtení mapy selhalo (HTTP ${response.status})`);
  return response.json();
}
