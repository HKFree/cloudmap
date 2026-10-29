import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { openDatabase, type Db } from '../db/connection';
import { importDia } from '../dia/import';
import { sampleDiagram } from '../test/fixtures';
import { userFromClaims, type AuthConfig } from './auth';
import { createSealer } from './seal';

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

  it('sends browsers to the SSO login', async () => {
    await start(ssoAuth);
    const response = await app.inject({ url: '/historie?x=1', headers: { accept: 'text/html' } });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/auth/login?returnTo=%2Fhistorie%3Fx%3D1');
  });

  it('accepts a session cookie and records the user as author', async () => {
    await start(ssoAuth);
    const session = createSealer(sessionSecret).seal({ user: { id: '277', name: 'Jakub' }, issuedAt: Date.now() });
    const cookie = `cloudmap_session=${session}`;

    expect((await app.inject({ url: '/api/v1/me', headers: { cookie } })).json()).toEqual({
      user: { id: '277', name: 'Jakub' },
      devMode: false,
    });
    expect((await save({ cookie })).statusCode).toBe(201);
    expect(await lastAuthor()).toBe('Jakub (277)');
  });

  it('ignores forged or expired sessions', async () => {
    await start(ssoAuth);
    const forged = createSealer('another-secret-that-is-long-enough-123').seal({ user: { id: '1', name: 'x' }, issuedAt: Date.now() });
    const expired = createSealer(sessionSecret).seal({ user: { id: '1', name: 'x' }, issuedAt: Date.now() - 8 * 86_400_000 });
    for (const session of [forged, expired, 'garbage']) {
      expect((await app.inject({ url: '/api/v1/me', headers: { cookie: `cloudmap_session=${session}` } })).statusCode).toBe(401);
    }
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

describe('userFromClaims', () => {
  it('uses the UserDB id and nickname from the hkfree SSO', () => {
    expect(userFromClaims({ sub: 'uuid', preferred_username: '277', family_name: 'Jakub' } as never)).toEqual({ id: '277', name: 'Jakub' });
    expect(userFromClaims({ sub: 'uuid' } as never)).toEqual({ id: 'uuid', name: 'uuid' });
  });
});
