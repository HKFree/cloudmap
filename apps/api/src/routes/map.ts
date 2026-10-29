import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { linkTypeSchema, mapDataSchema, nodeTypeSchema, revisionSchema } from '@cloudmap/shared';
import type { Db } from '../db/connection';
import { loadMap } from '../repo/map';
import { listRevisions } from '../repo/revisions';

const errorSchema = z.object({ error: z.string() });

export const mapRoutes =
  ({ db }: { db: Db }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get(
      '/map',
      {
        schema: {
          summary: 'Celá mapa – aktuální stav, nebo stav po zadané revizi',
          querystring: z.object({ revision: z.coerce.number().int().positive().optional() }),
          response: { 200: mapDataSchema, 404: errorSchema },
        },
      },
      async (request, reply) => {
        const map = await loadMap(db, request.query.revision);
        if (!map) return reply.code(404).send({ error: 'Revize neexistuje' });
        return map;
      },
    );

    app.get(
      '/revisions',
      { schema: { summary: 'Seznam revizí mapy', response: { 200: z.array(revisionSchema) } } },
      async () => listRevisions(db),
    );

    app.get(
      '/link-types',
      { schema: { summary: 'Typy spojů', response: { 200: z.array(linkTypeSchema) } } },
      async () => (await loadMap(db))!.linkTypes,
    );

    app.get(
      '/node-types',
      { schema: { summary: 'Typy uzlů', response: { 200: z.array(nodeTypeSchema) } } },
      async () => (await loadMap(db))!.nodeTypes,
    );
  };
