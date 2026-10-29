declare const __APP_VERSION__: string | undefined;

export const config = {
  host: process.env.LISTEN_HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: process.env.DATABASE_URL ?? 'sqlite:./data/cloudmap.db',
  /** Directory with the built web app; empty disables static serving (dev mode uses Vite). */
  staticDir: process.env.STATIC_DIR ?? '',
  version: process.env.APP_VERSION ?? (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'),
};
