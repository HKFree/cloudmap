import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import * as oidc from 'openid-client';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { currentUserSchema, type User } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { findApiKey, type ApiKey } from './apiKeys';
import { createSealer } from './seal';
import { createSession, deleteExpiredSessions, deleteSession, findSession, SESSION_IDLE_DAYS } from './sessions';

export type AuthConfig =
  | { devMode: true; apiKeys: ApiKey[] }
  | {
      devMode: false;
      apiKeys: ApiKey[];
      /** Address users open the app at; the SSO redirects back to `<publicUrl>/auth/callback`. */
      publicUrl: string;
      sessionSecret: string;
      oidc: { issuer: string; clientId: string; clientSecret: string };
    };

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export const DEV_USER: User = { id: 'dev', name: 'dev' };

/** Text stored as the revision author, e.g. "Jakub (277)", "dev" or "api:import". */
export const authorOf = (user: User) => (user.id === user.name ? user.name : `${user.name} (${user.id})`);

export function requireUser(request: FastifyRequest): User {
  if (!request.user) throw Object.assign(new Error('Nejsi přihlášený'), { statusCode: 401 });
  return request.user;
}

const SESSION_COOKIE = 'cloudmap_session';
const LOGIN_COOKIE = 'cloudmap_login';

interface PendingLogin {
  codeVerifier: string;
  state: string;
  returnTo: string;
}

/**
 * Everything except `/auth/*`, `/healthz` and the web app's static assets requires
 * a signed-in user: browsers sign in through the hkfree Keycloak (OIDC code flow with PKCE),
 * scripts send `Authorization: Bearer <api key>`. With `devMode` everybody is the user "dev".
 */
export async function registerAuth(appInstance: FastifyInstance, auth: AuthConfig, db: Db) {
  const app = appInstance.withTypeProvider<ZodTypeProvider>();
  await app.register(fastifyCookie);
  app.decorateRequest('user', null);

  const sealer = auth.devMode ? null : createSealer(auth.sessionSecret);
  const secureCookies = !auth.devMode && auth.publicUrl.startsWith('https://');
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' } as const;

  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_IDLE_DAYS * 24 * 60 * 60 });

  const userFromSession = async (request: FastifyRequest, reply: FastifyReply): Promise<User | null> => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return null;
    const session = await findSession(db, token);
    if (!session) return null;
    if (session.renewed) setSessionCookie(reply, token);
    return session.user;
  };

  app.addHook('onRequest', async (request, reply) => {
    const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      const key = findApiKey(auth.apiKeys, bearer);
      if (!key) return reply.code(401).send({ error: 'Neplatný API klíč' });
      request.user = { id: `api:${key.name}`, name: `api:${key.name}` };
      return;
    }
    request.user = auth.devMode ? DEV_USER : await userFromSession(request, reply);
    if (request.user) return;

    // The matched route pattern, not the raw URL: the router decodes `/%61pi/...` to `/api/...`.
    const route = request.routeOptions.url;
    if (route?.startsWith('/api/')) return reply.code(401).send({ error: 'Nejsi přihlášený' });
    const wantsPage = request.method === 'GET' && request.headers.accept?.includes('text/html');
    if (wantsPage && !route?.startsWith('/auth/') && route !== '/healthz') {
      return reply.redirect(`/auth/login?returnTo=${encodeURIComponent(request.url)}`);
    }
  });

  app.get(
    '/api/v1/me',
    { schema: { summary: 'Přihlášený uživatel', response: { 200: currentUserSchema } } },
    async (request) => ({ user: requireUser(request), devMode: auth.devMode }),
  );

  const returnToQuery = { querystring: z.object({ returnTo: z.string().optional() }), hide: true };

  if (auth.devMode) {
    app.get('/auth/login', { schema: returnToQuery }, async (request, reply) => reply.redirect(safeReturnTo(request.query.returnTo)));
    app.get('/auth/logout', { schema: { hide: true } }, async (_request, reply) => reply.redirect('/'));
    return;
  }

  const { publicUrl } = auth;
  let discovered: Promise<oidc.Configuration> | null = null;
  // Discovered on first use, so the app starts even when the SSO server is down.
  const oidcConfig = () => {
    discovered ??= oidc.discovery(new URL(auth.oidc.issuer), auth.oidc.clientId, auth.oidc.clientSecret).catch((error) => {
      discovered = null;
      throw error;
    });
    return discovered;
  };

  app.get('/auth/login', { schema: returnToQuery }, async (request, reply) => {
    const pending: PendingLogin = {
      codeVerifier: oidc.randomPKCECodeVerifier(),
      state: oidc.randomState(),
      returnTo: safeReturnTo(request.query.returnTo),
    };
    const url = oidc.buildAuthorizationUrl(await oidcConfig(), {
      redirect_uri: `${publicUrl}/auth/callback`,
      scope: 'openid profile email',
      code_challenge: await oidc.calculatePKCECodeChallenge(pending.codeVerifier),
      code_challenge_method: 'S256',
      state: pending.state,
    });
    reply.setCookie(LOGIN_COOKIE, sealer!.seal(pending), { ...cookieOptions, path: '/auth', maxAge: 15 * 60 });
    return reply.redirect(url.href);
  });

  app.get('/auth/callback', { schema: { hide: true } }, async (request, reply) => {
    const pending = sealer!.unseal<PendingLogin>(request.cookies[LOGIN_COOKIE]);
    if (!pending) return reply.redirect('/auth/login');
    reply.clearCookie(LOGIN_COOKIE, { ...cookieOptions, path: '/auth' });

    let claims: oidc.IDToken | undefined;
    try {
      const tokens = await oidc.authorizationCodeGrant(await oidcConfig(), new URL(request.url, publicUrl), {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: pending.state,
      });
      claims = tokens.claims();
    } catch (error) {
      request.log.warn({ err: error }, 'SSO login failed');
    }
    if (!claims) return reply.code(401).type('text/plain; charset=utf-8').send('Přihlášení se nezdařilo. Zkus to znovu: /auth/login');

    await deleteExpiredSessions(db);
    setSessionCookie(reply, await createSession(db, userFromClaims(claims)));
    return reply.redirect(pending.returnTo);
  });

  app.get('/auth/logout', { schema: { hide: true } }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    const url = oidc.buildEndSessionUrl(await oidcConfig(), {
      client_id: auth.oidc.clientId,
      post_logout_redirect_uri: `${publicUrl}/`,
    });
    return reply.redirect(url.href);
  });
}

/** In the hkfree SSO `preferred_username` is the UserDB id and `family_name` the nickname. */
export function userFromClaims(claims: oidc.IDToken): User {
  const id = String(claims.preferred_username ?? claims.sub);
  const name = [claims.family_name, claims.name, claims.preferred_username].find((v) => typeof v === 'string' && v);
  return { id, name: String(name ?? id) };
}

/** Only local paths, so the login cannot be abused to redirect elsewhere. */
function safeReturnTo(returnTo: string | undefined) {
  return returnTo && /^\/(?![/\\])/.test(returnTo) && !returnTo.startsWith('/auth/') ? returnTo : '/';
}
