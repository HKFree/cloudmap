import { readFileSync } from 'node:fs';

/**
 * Version shown in the app. CI passes APP_VERSION from the git tag (e.g. 0.1.0);
 * manual builds use the root package.json version.
 */
export function appVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION.replace(/^v/, '');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return pkg.version;
}
