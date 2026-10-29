import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { openDatabase, type Db } from './db/connection';
import { importDia } from './dia/import';
import { sampleDiagram } from './test/fixtures';

describe('API', () => {
  let db: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    db = await openDatabase('sqlite::memory:');
    await importDia(db, sampleDiagram());
    app = await buildApp({ db, version: '1.2.3' });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  it('reports the version', async () => {
    const response = await app.inject({ url: '/api/v1/meta' });
    expect(response.json()).toEqual({ name: 'hkfree cloudmap', version: '1.2.3' });
  });

  it('returns the current map', async () => {
    const response = await app.inject({ url: '/api/v1/map' });
    expect(response.statusCode).toBe(200);
    const map = response.json();
    expect(map.nodes.length).toBeGreaterThan(0);
    expect(map.links[0].capacity).toBe('250Mbps');
  });

  it('returns 404 for an unknown revision and 400 for an invalid one', async () => {
    expect((await app.inject({ url: '/api/v1/map?revision=99' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/map?revision=abc' })).statusCode).toBe(400);
  });

  it('serves the OpenAPI document', async () => {
    const response = await app.inject({ url: '/api/v1/docs/json' });
    expect(response.json().paths).toHaveProperty('/api/v1/map');
  });
});
