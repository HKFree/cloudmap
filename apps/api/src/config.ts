import type { AuthConfig } from './auth/auth';
import { loadApiKeys } from './auth/apiKeys';

declare const __APP_VERSION__: string | undefined;

const env = process.env;

export const config = {
  host: env.LISTEN_HOST ?? '0.0.0.0',
  port: Number(env.PORT ?? 8080),
  databaseUrl: env.DATABASE_URL ?? 'sqlite:./data/cloudmap.db',
  /** Directory with the built web app; empty disables static serving (dev mode uses Vite). */
  staticDir: env.STATIC_DIR ?? '',
  version: env.APP_VERSION ?? (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'),
};

/** Reads auth settings; without DEV_MODE the SSO settings are mandatory. */
export function loadAuthConfig(): AuthConfig {
  const apiKeys = env.API_KEYS_FILE ? loadApiKeys(env.API_KEYS_FILE) : [];
  if (env.DEV_MODE === 'true') return { devMode: true, apiKeys };

  const missing = ['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'PUBLIC_URL', 'SESSION_SECRET'].filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}. Set them, or set DEV_MODE=true to run without login.`);
  }
  if (env.SESSION_SECRET!.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters long.');

  return {
    devMode: false,
    apiKeys,
    publicUrl: env.PUBLIC_URL!.replace(/\/+$/, ''),
    sessionSecret: env.SESSION_SECRET!,
    oidc: {
      issuer: env.OIDC_ISSUER || 'https://sso.hkfree.org/realms/hkfree',
      clientId: env.OIDC_CLIENT_ID!,
      clientSecret: env.OIDC_CLIENT_SECRET!,
    },
  };
}
