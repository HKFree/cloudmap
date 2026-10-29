import { buildApp } from './app';
import { config } from './config';
import { openDatabase } from './db/connection';

const db = await openDatabase(config.databaseUrl);
const app = await buildApp({ db, version: config.version, staticDir: config.staticDir, logger: true });

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: config.host, port: config.port });
