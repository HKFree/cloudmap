import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { metaSchema } from '@cloudmap/shared';

export const metaRoutes =
  ({ version }: { version: string }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/meta',
      { schema: { summary: 'Informace o aplikaci', response: { 200: metaSchema } } },
      async () => ({ name: 'hkfree cloudmap', version }),
    );
  };
