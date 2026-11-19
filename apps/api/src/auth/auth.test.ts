import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { openDatabase, type Db } from '../db/connection';
import { importDia } from '../dia/import';
import { sampleDiagram } from '../test/fixtures';
import { requireUser, userFromClaims, type AuthConfig } from './auth';
import { createSealer } from './seal';
import { createSession } from './sessions';

// Keeps the tests offline: logout would otherwise run OIDC discovery against the issuer.
vi.mock('openid-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('openid-client')>()),
  discovery: vi.fn(async () => ({})),
  buildEndSessionUrl: vi.fn(() => new URL('https://sso.example.org/logout')),
}));

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const sessionSecret = 'test-secret-that-is-long-enough-1234567890';
const apiKeys = [{ name: 'skript', key: 'a-very-secret-api-key' }];
const ssoAuth: AuthConfig = {
  devMode: false,
  apiKeys,
  publicUrl: 'https://cloudmap.example.org',
  sessionSecret,
  oidc: { issuer: 'https://sso.example.org/realms/hkfree', clientId: 'cloudmap', clientSecret: 'secret' },
};

describe('authentication', () => {
  let db: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;

  const start = async (auth: AuthConfig) => {
    db = await openDatabase('sqlite::memory:');
    await importDia(db, sampleDiagram());
    app = await buildApp({ db, version: 'test', auth });
  };
  const save = (headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/v1/changes', headers, payload: { baseRevisionId: 1, message: 'test' } });
  const lastAuthor = async () => (await app.inject({ url: '/api/v1/revisions', headers: bearer() })).json()[0].author;
  const bearer = (key = apiKeys[0]!.key) => ({ authorization: `Bearer ${key}` });

  afterEach(async () => {
    await app.close();
    await db.destroy();
  });

  it('rejects API requests without login', async () => {
    await start(ssoAuth);
    expect((await app.inject({ url: '/api/v1/map' })).statusCode).toBe(401);
    expect((await save()).statusCode).toBe(401);
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
  });

  it('rejects percent-encoded API paths without login', async () => {
    await start(ssoAuth);
    for (const url of ['/%61pi/v1/map', '/a%70i/v1/meta', '/ap%69/v1/me', '/%61pi/v1/revisions', '/%61pi/v1/docs/json']) {
      expect((await app.inject({ url })).statusCode, url).toBe(401);
    }
    const encodedSave = await app.inject({ method: 'POST', url: '/%61pi/v1/changes', payload: { baseRevisionId: 1, message: 'x' } });
    expect(encodedSave.statusCode).toBe(401);
  });

  it('sends browsers to the SSO login', async () => {
    await start(ssoAuth);
    const response = await app.inject({ url: '/historie?x=1', headers: { accept: 'text/html' } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/auth/login?returnTo=%2Fhistorie%3Fx%3D1');
  });

  it('accepts a session cookie and records the user as author', async () => {
    await start(ssoAuth);
    const cookie = `cloudmap_session=${await createSession(db, { id: '277', name: 'Jakub' })}`;

    expect((await app.inject({ url: '/api/v1/me', headers: { cookie } })).json()).toEqual({
      user: { id: '277', name: 'Jakub' },
      devMode: false,
    });
    expect((await save({ cookie })).statusCode).toBe(201);
    expect(await lastAuthor()).toBe('Jakub (277)');
  });

  it('ignores unknown and expired sessions', async () => {
    await start(ssoAuth);
    const sealed = createSealer(sessionSecret).seal({ user: { id: '1', name: 'x' }, issuedAt: Date.now() });
    const idle = await createSession(db, { id: '1', name: 'x' });
    const tooOld = await createSession(db, { id: '2', name: 'y' });
    await db.updateTable('session').set({ last_seen_at: daysAgo(8) }).where('user_id', '=', '1').execute();
    await db.updateTable('session').set({ created_at: daysAgo(31) }).where('user_id', '=', '2').execute();

    for (const session of [sealed, idle, tooOld, 'garbage']) {
      expect((await app.inject({ url: '/api/v1/me', headers: { cookie: `cloudmap_session=${session}` } })).statusCode).toBe(401);
    }
    expect(await db.selectFrom('session').selectAll().execute()).toEqual([]);
  });

  it('renews the cookie of a session used again after a day', async () => {
    await start(ssoAuth);
    const token = await createSession(db, { id: '1', name: 'x' });
    const me = () => app.inject({ url: '/api/v1/me', headers: { cookie: `cloudmap_session=${token}` } });

    expect((await me()).headers['set-cookie']).toBeUndefined();
    await db.updateTable('session').set({ last_seen_at: daysAgo(2) }).execute();
    expect((await me()).headers['set-cookie']).toMatch(/^cloudmap_session=/);
  });

  it('revokes the session on logout', async () => {
    await start(ssoAuth);
    const cookie = `cloudmap_session=${await createSession(db, { id: '277', name: 'Jakub' })}`;
    const other = `cloudmap_session=${await createSession(db, { id: '277', name: 'Jakub' })}`;

    const logout = await app.inject({ url: '/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(302);
    expect(logout.headers.location).toBe('https://sso.example.org/logout');
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/v1/me', headers: { cookie: other } })).statusCode).toBe(200);
  });

  it('accepts API keys', async () => {
    await start(ssoAuth);
    expect((await app.inject({ url: '/api/v1/map', headers: bearer('wrong-key') })).statusCode).toBe(401);
    expect((await save(bearer())).statusCode).toBe(201);
    expect(await lastAuthor()).toBe('api:skript');
  });

  it('records changes as "dev" in dev mode', async () => {
    await start({ devMode: true, apiKeys });
    expect((await app.inject({ url: '/api/v1/me' })).json()).toEqual({ user: { id: 'dev', name: 'dev' }, devMode: true });
    expect((await save()).statusCode).toBe(201);
    const restored = await app.inject({ method: 'POST', url: '/api/v1/revisions/1/restore', payload: {} });
    expect(restored.json().author).toBe('dev');
    expect(await lastAuthor()).toBe('dev');
  });

  it('only redirects back to local paths after login', async () => {
    await start({ devMode: true, apiKeys });
    for (const [returnTo, expected] of [
      ['/historie', '/historie'],
      ['//evil.example', '/'],
      ['/\\evil.example', '/'],
      ['https://evil.example', '/'],
    ]) {
      const response = await app.inject({ url: `/auth/login?returnTo=${encodeURIComponent(returnTo!)}` });
      expect(response.headers.location).toBe(expected);
    }
  });
});

describe('requireUser', () => {
  it('fails with 401 when nobody is signed in', () => {
    expect(() => requireUser({ user: null } as never)).toThrow(expect.objectContaining({ statusCode: 401 }));
    expect(requireUser({ user: { id: '1', name: 'x' } } as never)).toEqual({ id: '1', name: 'x' });
  });
});

describe('userFromClaims', () => {
  it('uses the UserDB id and nickname from the hkfree SSO', () => {
    expect(userFromClaims({ sub: 'uuid', preferred_username: '277', family_name: 'Jakub' } as never)).toEqual({ id: '277', name: 'Jakub' });
    expect(userFromClaims({ sub: 'uuid' } as never)).toEqual({ id: 'uuid', name: 'uuid' });
  });
});
