import { buildApp } from './app';
import { config, loadAuthConfig } from './config';
import { openDatabase } from './db/connection';

const auth = loadAuthConfig();
const db = await openDatabase(config.databaseUrl);
const app = await buildApp({ db, version: config.version, auth, staticDir: config.staticDir, logger: true });
if (auth.devMode) app.log.warn('DEV_MODE: login is disabled, changes are recorded as made by "dev"');

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: config.host, port: config.port });
