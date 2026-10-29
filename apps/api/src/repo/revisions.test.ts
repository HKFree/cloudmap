import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/connection';
import { importDia } from '../dia/import';
import { sampleDiagram } from '../test/fixtures';
import { loadMap, nodeRow } from './map';
import { commitChanges, listRevisions } from './revisions';

describe('revisions', () => {
  let db: Db;

  beforeEach(async () => {
    db = await openDatabase('sqlite::memory:');
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('imports a diagram as the first revision', async () => {
    const { revision } = await importDia(db, sampleDiagram());
    expect(revision?.id).toBe(1);
    const map = await loadMap(db);
    expect(map?.links).toHaveLength(1);
    expect(map?.revision?.id).toBe(1);
  });

  it('refuses to import over an existing map unless replace is set', async () => {
    await importDia(db, sampleDiagram());
    await expect(importDia(db, sampleDiagram())).rejects.toThrow(/--replace/);
    const { revision } = await importDia(db, sampleDiagram().replace('Volný popisek', 'Jiný popisek'), { replace: true });
    expect(revision?.id).toBe(2);
    expect((await loadMap(db))?.labels.map((l) => l.text)).toEqual(['Jiný popisek']);
  });

  it('creates no revision when the same diagram is imported again', async () => {
    await importDia(db, sampleDiagram());
    const { revision } = await importDia(db, sampleDiagram(), { replace: true });
    expect(revision).toBeNull();
    expect(await listRevisions(db)).toHaveLength(1);
  });

  it('keeps older states readable after updates and deletes', async () => {
    await importDia(db, sampleDiagram());
    const original = (await loadMap(db))!;
    const node = original.nodes.find((n) => n.label === '1 Alfa')!;

    await commitChanges(db, { message: 'Přejmenování' }, { upsert: { node: [nodeRow({ ...node, label: '1 Alfa nová' })] } });
    const link = original.links[0]!;
    await commitChanges(db, { message: 'Smazání spoje' }, { delete: { link: [link.id] } });

    const current = (await loadMap(db))!;
    expect(current.links).toHaveLength(0);
    expect(current.nodes.find((n) => n.id === node.id)?.label).toBe('1 Alfa nová');

    const afterRename = (await loadMap(db, 2))!;
    expect(afterRename.links).toHaveLength(1);
    expect(afterRename.nodes.find((n) => n.id === node.id)?.label).toBe('1 Alfa nová');

    const first = (await loadMap(db, 1))!;
    expect(first.nodes.find((n) => n.id === node.id)?.label).toBe('1 Alfa');

    expect((await listRevisions(db)).map((r) => r.message)).toEqual(['Smazání spoje', 'Přejmenování', 'Import z Dia diagramu']);
  });

  it('returns null for an unknown revision', async () => {
    expect(await loadMap(db, 42)).toBeNull();
  });
});
