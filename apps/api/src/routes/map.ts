import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  linkTypeSchema,
  mapDataSchema,
  nodeTypeSchema,
  restoreRevisionSchema,
  revisionSchema,
  revisionSummarySchema,
  saveChangesSchema,
} from '@cloudmap/shared';
import { authorOf } from '../auth/auth';
import type { Db } from '../db/connection';
import { restoreRevision, saveChanges, ValidationError } from '../repo/changes';
import { loadMap } from '../repo/map';
import { ConflictError, listRevisions } from '../repo/revisions';

const errorSchema = z.object({ error: z.string() });

export const mapRoutes =
  ({ db }: { db: Db }): FastifyPluginAsyncZod =>
  async (app) => {
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ConflictError) return reply.code(409).send({ error: error.message });
      if (error instanceof ValidationError) return reply.code(422).send({ error: error.message });
      throw error;
    });

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

    app.post(
      '/changes',
      {
        schema: {
          summary: 'Uloží změny mapy jako novou revizi',
          description:
            'Položky v `upsert` se vloží nebo přepíší podle id, `delete` obsahuje id k odstranění. ' +
            '`baseRevisionId` je revize, ze které klient vycházel; pokud mezitím vznikla novější, vrací 409.',
          body: saveChangesSchema,
          response: { 201: revisionSchema, 409: errorSchema, 422: errorSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await saveChanges(db, { ...request.body, author: authorOf(request.user!) })),
    );

    app.get(
      '/revisions',
      { schema: { summary: 'Seznam revizí mapy se souhrnem změn', response: { 200: z.array(revisionSummarySchema) } } },
      async () => listRevisions(db),
    );

    app.post(
      '/revisions/:id/restore',
      {
        schema: {
          summary: 'Obnoví mapu do stavu po zadané revizi (vytvoří novou revizi)',
          params: z.object({ id: z.coerce.number().int().positive() }),
          body: restoreRevisionSchema,
          response: { 201: revisionSchema, 404: errorSchema, 422: errorSchema },
        },
      },
      async (request, reply) => {
        const revision = await restoreRevision(db, request.params.id, request.body.message, authorOf(request.user!));
        if (!revision) return reply.code(404).send({ error: 'Revize neexistuje' });
        return reply.code(201).send(revision);
      },
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
