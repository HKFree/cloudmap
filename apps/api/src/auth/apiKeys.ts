import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export interface ApiKey {
  name: string;
  key: string;
}

/**
 * Reads `{ "<name>": "<key>", ... }`. A missing file means no keys.
 * Revisions saved with a key get the author `api:<name>`.
 */
export function loadApiKeys(file: string): ApiKey[] {
  if (!existsSync(file)) return [];
  const content: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error(`${file}: expected an object of "name": "key" pairs`);
  }
  return Object.entries(content).map(([name, key]) => {
    if (typeof key !== 'string' || key.length < 16) throw new Error(`${file}: key "${name}" must be at least 16 characters`);
    return { name, key };
  });
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function findApiKey(keys: ApiKey[], presented: string): ApiKey | undefined {
  const presentedDigest = digest(presented);
  return keys.find((k) => timingSafeEqual(digest(k.key), presentedDigest));
}
