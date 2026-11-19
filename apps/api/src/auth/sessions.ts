import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@cloudmap/shared';
import type { Db } from '../db/connection';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A session ends after a week without use… */
export const SESSION_IDLE_DAYS = 7;
/** …and a month after login at the latest, so access is re-checked against the SSO. */
export const SESSION_MAX_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

/** Stores a new session and returns the token for the cookie. */
export async function createSession(db: Db, user: User): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  await db
    .insertInto('session')
    .values({ id: hashToken(token), user_id: user.id, user_name: user.name, created_at: now, last_seen_at: now })
    .execute();
  return token;
}

/** Returns the signed-in user and whether the cookie should be renewed, or null for an unknown or expired token. */
export async function findSession(db: Db, token: string): Promise<{ user: User; renewed: boolean } | null> {
  const id = hashToken(token);
  const session = await db.selectFrom('session').selectAll().where('id', '=', id).executeTakeFirst();
  if (!session) return null;
  if (session.last_seen_at < daysAgo(SESSION_IDLE_DAYS) || session.created_at < daysAgo(SESSION_MAX_DAYS)) {
    await db.deleteFrom('session').where('id', '=', id).execute();
    return null;
  }
  // Recorded at most daily, so reading the map does not write to the database on every request.
  const renewed = session.last_seen_at < daysAgo(1);
  if (renewed) await db.updateTable('session').set({ last_seen_at: new Date().toISOString() }).where('id', '=', id).execute();
  return { user: { id: session.user_id, name: session.user_name }, renewed };
}

export async function deleteSession(db: Db, token: string) {
  await db.deleteFrom('session').where('id', '=', hashToken(token)).execute();
}

export async function deleteExpiredSessions(db: Db) {
  await db
    .deleteFrom('session')
    .where((eb) => eb.or([eb('last_seen_at', '<', daysAgo(SESSION_IDLE_DAYS)), eb('created_at', '<', daysAgo(SESSION_MAX_DAYS))]))
    .execute();
}
