import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { registerAuth, type AuthConfig } from './auth/auth';
import type { Db } from './db/connection';
import { mapRoutes } from './routes/map';
import { metaRoutes } from './routes/meta';

export interface AppOptions {
  db: Db;
  version: string;
  auth: AuthConfig;
  staticDir?: string;
  logger?: boolean;
}

export async function buildApp({ db, version, auth, staticDir, logger = false }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: { info: { title: 'hkfree cloudmap API', version } },
    transform: jsonSchemaTransform,
  });
  // The production bundle ships Swagger UI assets next to itself (see build.mjs).
  const bundledSwaggerUi = fileURLToPath(new URL('./static', import.meta.url));
  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/v1/docs',
    ...(existsSync(bundledSwaggerUi) ? { baseDir: bundledSwaggerUi } : {}),
  });

  await registerAuth(app, auth);

  app.get('/healthz', { schema: { hide: true } }, async () => ({ ok: true }));
  await app.register(metaRoutes({ version }), { prefix: '/api/v1' });
  await app.register(mapRoutes({ db }), { prefix: '/api/v1' });

  if (staticDir && existsSync(staticDir)) {
    const root = resolve(staticDir);
    await app.register(fastifyStatic, { root, wildcard: false });
    // Client-side routes fall back to the SPA entry point.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) {
        return reply.sendFile('index.html', root);
      }
      return reply.code(404).send({ error: 'Nenalezeno' });
    });
  }

  return app;
}
