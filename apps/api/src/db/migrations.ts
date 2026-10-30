import type { CreateTableBuilder, Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';

/*
 * Migrations use only Kysely's schema builder and portable column types,
 * so the same definitions work on SQLite now and MySQL later.
 */

type TableBuilder = CreateTableBuilder<string, string>;

const entityColumns: Record<string, (t: TableBuilder) => TableBuilder> = {
  link_type: (t) =>
    t
      .addColumn('name', 'varchar(255)', (c) => c.notNull())
      .addColumn('color', 'varchar(16)', (c) => c.notNull())
      .addColumn('width', 'double precision', (c) => c.notNull())
      .addColumn('dash', 'varchar(64)', (c) => c.notNull())
      .addColumn('description', 'text', (c) => c.notNull())
      .addColumn('sort_order', 'integer', (c) => c.notNull()),
  node_type: (t) =>
    t
      .addColumn('name', 'varchar(255)', (c) => c.notNull())
      .addColumn('shape', 'varchar(32)', (c) => c.notNull())
      .addColumn('fill_color', 'varchar(16)')
      .addColumn('stroke_color', 'varchar(16)', (c) => c.notNull())
      .addColumn('is_area', 'integer', (c) => c.notNull())
      .addColumn('description', 'text', (c) => c.notNull())
      .addColumn('sort_order', 'integer', (c) => c.notNull()),
  node: (t) =>
    t
      .addColumn('type_id', 'varchar(64)', (c) => c.notNull())
      .addColumn('label', 'text', (c) => c.notNull())
      .addColumn('x', 'double precision', (c) => c.notNull())
      .addColumn('y', 'double precision', (c) => c.notNull())
      .addColumn('width', 'double precision', (c) => c.notNull())
      .addColumn('height', 'double precision', (c) => c.notNull())
      .addColumn('font_size', 'double precision', (c) => c.notNull())
      .addColumn('label_dx', 'double precision', (c) => c.notNull())
      .addColumn('label_dy', 'double precision', (c) => c.notNull())
      .addColumn('note', 'text', (c) => c.notNull()),
  link: (t) =>
    t
      .addColumn('type_id', 'varchar(64)', (c) => c.notNull())
      .addColumn('from_node_id', 'varchar(64)', (c) => c.notNull())
      .addColumn('to_node_id', 'varchar(64)', (c) => c.notNull())
      .addColumn('shape', 'varchar(32)', (c) => c.notNull())
      .addColumn('curvature', 'double precision', (c) => c.notNull())
      .addColumn('capacity', 'varchar(255)', (c) => c.notNull())
      .addColumn('label_x', 'double precision')
      .addColumn('label_y', 'double precision')
      .addColumn('note', 'text', (c) => c.notNull()),
  link_point: (t) =>
    t
      .addColumn('link_id', 'varchar(64)', (c) => c.notNull())
      .addColumn('seq', 'integer', (c) => c.notNull())
      .addColumn('x', 'double precision', (c) => c.notNull())
      .addColumn('y', 'double precision', (c) => c.notNull()),
  label: (t) =>
    t
      .addColumn('text', 'text', (c) => c.notNull())
      .addColumn('x', 'double precision', (c) => c.notNull())
      .addColumn('y', 'double precision', (c) => c.notNull())
      .addColumn('font_size', 'double precision', (c) => c.notNull())
      .addColumn('bold', 'integer', (c) => c.notNull())
      .addColumn('color', 'varchar(16)', (c) => c.notNull())
      .addColumn('align', 'varchar(16)', (c) => c.notNull()),
};

const foreignKeys: Record<string, (t: TableBuilder) => TableBuilder> = {
  node: (t) => t.addForeignKeyConstraint('node_type_fk', ['type_id'], 'node_type', ['id']),
  link: (t) =>
    t
      .addForeignKeyConstraint('link_type_fk', ['type_id'], 'link_type', ['id'])
      .addForeignKeyConstraint('link_from_fk', ['from_node_id'], 'node', ['id'])
      .addForeignKeyConstraint('link_to_fk', ['to_node_id'], 'node', ['id']),
  link_point: (t) =>
    t.addForeignKeyConstraint('link_point_link_fk', ['link_id'], 'link', ['id'], (c) => c.onDelete('cascade')),
};

const initial: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('revision')
      .addColumn('id', 'integer', (c) => c.primaryKey().autoIncrement())
      .addColumn('created_at', 'varchar(32)', (c) => c.notNull())
      .addColumn('author', 'varchar(255)', (c) => c.notNull())
      .addColumn('message', 'text', (c) => c.notNull())
      .execute();

    for (const [table, addColumns] of Object.entries(entityColumns)) {
      let live = db.schema.createTable(table).addColumn('id', 'varchar(64)', (c) => c.primaryKey());
      live = addColumns(live);
      live = foreignKeys[table]?.(live) ?? live;
      await live.execute();

      let history = db.schema.createTable(`${table}_history`).addColumn('id', 'varchar(64)', (c) => c.notNull());
      history = addColumns(history)
        .addColumn('valid_from_rev', 'integer', (c) => c.notNull())
        .addColumn('valid_to_rev', 'integer')
        .addPrimaryKeyConstraint(`${table}_history_pk`, ['id', 'valid_from_rev']);
      await history.execute();

      await db.schema
        .createIndex(`${table}_history_rev_idx`)
        .on(`${table}_history`)
        .columns(['valid_from_rev', 'valid_to_rev'])
        .execute();
    }

    await db.schema.createIndex('link_from_idx').on('link').column('from_node_id').execute();
    await db.schema.createIndex('link_to_idx').on('link').column('to_node_id').execute();
    await db.schema.createIndex('link_point_link_idx').on('link_point').columns(['link_id', 'seq']).execute();
  },

  async down(db: Kysely<any>) {
    for (const table of Object.keys(entityColumns).reverse()) {
      await db.schema.dropTable(`${table}_history`).execute();
      await db.schema.dropTable(table).execute();
    }
    await db.schema.dropTable('revision').execute();
  },
};

/** Added before the first release with an editor; v0.1.0 databases get the defaults. */
const editorColumns: Migration = {
  async up(db: Kysely<any>) {
    for (const table of ['link_type', 'link_type_history']) {
      await db.schema.alterTable(table).addColumn('remote', 'integer', (c) => c.notNull().defaultTo(0)).execute();
    }
    for (const table of ['link', 'link_history']) {
      await db.schema.alterTable(table).addColumn('corner_radius', 'double precision', (c) => c.notNull().defaultTo(0)).execute();
    }
  },
  async down(db: Kysely<any>) {
    for (const table of ['link_type', 'link_type_history']) await db.schema.alterTable(table).dropColumn('remote').execute();
    for (const table of ['link', 'link_history']) await db.schema.alterTable(table).dropColumn('corner_radius').execute();
  },
};

/** Provider name of external uplinks, which lead out of the map (stored with to_node_id = from_node_id). */
const linkPeer: Migration = {
  async up(db: Kysely<any>) {
    for (const table of ['link', 'link_history']) {
      await db.schema.alterTable(table).addColumn('peer', 'varchar(255)', (c) => c.notNull().defaultTo('')).execute();
    }
  },
  async down(db: Kysely<any>) {
    for (const table of ['link', 'link_history']) await db.schema.alterTable(table).dropColumn('peer').execute();
  },
};

const migrations: Record<string, Migration> = {
  '0001_initial': initial,
  '0002_editor_columns': editorColumns,
  '0003_link_peer': linkPeer,
};

export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    if (result.status === 'Error') console.error(`Migrace ${result.migrationName} selhala`);
  }
  if (error) throw error;
}
