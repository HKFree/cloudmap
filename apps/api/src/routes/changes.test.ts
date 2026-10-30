import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CORE_NODE_ID, type MapData } from '@cloudmap/shared';
import { buildApp } from '../app';
import { openDatabase, type Db } from '../db/connection';
import { importDia } from '../dia/import';
import { sampleDiagram } from '../test/fixtures';

describe('editing API', () => {
  let db: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;

  const getMap = async (revision?: number): Promise<MapData> =>
    (await app.inject({ url: `/api/v1/map${revision ? `?revision=${revision}` : ''}` })).json();
  const save = (payload: object) => app.inject({ method: 'POST', url: '/api/v1/changes', payload });

  beforeEach(async () => {
    db = await openDatabase('sqlite::memory:');
    await importDia(db, sampleDiagram());
    app = await buildApp({ db, version: 'test', auth: { devMode: true, apiKeys: [] } });
  });

  afterEach(async () => {
    await app.close();
    await db.destroy();
  });

  it('saves edits as a new revision', async () => {
    const map = await getMap();
    const link = { ...map.links[0]!, capacity: '1Gbps', note: 'nový spoj', shape: 'bezier', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] };
    const response = await save({ baseRevisionId: 1, message: 'Upgrade', upsert: { links: [link] } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: 2, message: 'Upgrade' });

    const updated = await getMap();
    expect(updated.links[0]).toMatchObject({ capacity: '1Gbps', note: 'nový spoj' });
    expect(updated.links[0]!.points).toHaveLength(2);

    await save({ baseRevisionId: 2, upsert: { links: [{ ...link, shape: 'straight', points: [] }] } });
    expect((await getMap()).links[0]!.points).toHaveLength(0);
    expect((await getMap(2)).links[0]!.points).toHaveLength(2);
  });

  it('rejects saving over a newer revision', async () => {
    await save({ baseRevisionId: 1, message: 'první' });
    const response = await save({ baseRevisionId: 1, message: 'druhá' });
    expect(response.statusCode).toBe(409);
  });

  it('rejects deleting a node that links still use', async () => {
    const map = await getMap();
    const response = await save({ baseRevisionId: 1, delete: { nodes: [map.links[0]!.fromNodeId] } });
    expect(response.statusCode).toBe(422);
    expect((await getMap()).revision?.id).toBe(1);
  });

  it('deletes a node together with its links', async () => {
    const map = await getMap();
    const link = map.links[0]!;
    const response = await save({ baseRevisionId: 1, delete: { nodes: [link.fromNodeId], links: [link.id] } });
    expect(response.statusCode).toBe(201);
    expect((await getMap()).links).toHaveLength(0);
  });

  it('refuses to delete the core node', async () => {
    const core = { ...(await getMap()).nodes[0]!, id: CORE_NODE_ID };
    expect((await save({ baseRevisionId: 1, upsert: { nodes: [core] } })).statusCode).toBe(201);
    const response = await save({ baseRevisionId: 2, delete: { nodes: [CORE_NODE_ID] } });
    expect(response.statusCode).toBe(422);
  });

  it('adds a new link type', async () => {
    const type = { id: 'lt-new', name: '18GHz', color: '#ff06b0', width: 6, dash: '', description: '', sortOrder: 5, remote: false };
    expect((await save({ baseRevisionId: 1, upsert: { linkTypes: [type] } })).statusCode).toBe(201);
    expect((await getMap()).linkTypes.map((t) => t.name)).toContain('18GHz');
  });

  it('saves an external uplink only with a remote link type', async () => {
    const map = await getMap();
    const uplink = { ...map.links[0]!, id: 'uplink', toNodeId: null, peer: 'CETIN', points: [{ x: 5, y: 6 }] };
    expect((await save({ baseRevisionId: 1, upsert: { links: [uplink] } })).statusCode).toBe(422);

    const remoteType = { ...map.linkTypes[0]!, id: 'konektivita', name: 'konektivita', remote: true };
    const response = await save({ baseRevisionId: 1, upsert: { linkTypes: [remoteType], links: [{ ...uplink, typeId: remoteType.id }] } });
    expect(response.statusCode).toBe(201);
    expect((await getMap()).links.find((l) => l.id === 'uplink')).toMatchObject({ toNodeId: null, peer: 'CETIN', points: [{ x: 5, y: 6 }] });
  });

  it('restores an older revision and summarises changes', async () => {
    const map = await getMap();
    const link = map.links[0]!;
    await save({ baseRevisionId: 1, delete: { links: [link.id] } });
    expect((await getMap()).links).toHaveLength(0);

    const restored = await app.inject({ method: 'POST', url: '/api/v1/revisions/1/restore', payload: {} });
    expect(restored.statusCode).toBe(201);
    expect(restored.json().message).toBe('Obnovení revize #1');
    expect((await getMap()).links).toEqual(map.links);

    const revisions = (await app.inject({ url: '/api/v1/revisions' })).json();
    expect(revisions.map((r: { id: number }) => r.id)).toEqual([3, 2, 1]);
    expect(revisions[1].changes.links).toEqual({ added: 0, changed: 0, deleted: 1 });
    expect(revisions[0].changes.links).toEqual({ added: 1, changed: 0, deleted: 0 });
    expect(revisions[2].changes.nodes.added).toBe(map.nodes.length);
  });

  it('returns 404 when restoring an unknown revision', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/revisions/9/restore', payload: {} })).statusCode).toBe(404);
  });
});
