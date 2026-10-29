import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { config } from '../config';
import { openDatabase } from '../db/connection';
import { importDia } from '../dia/import';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    replace: { type: 'boolean', default: false },
    message: { type: 'string' },
  },
});

const file = positionals[0];
if (!file) {
  console.error('Použití: import-dia <soubor.dia> [--replace] [--message "popis"]');
  process.exit(2);
}

const db = await openDatabase(config.databaseUrl);
try {
  const { revision, report } = await importDia(db, readFileSync(file, 'utf8'), {
    replace: values.replace,
    message: values.message,
  });
  console.log(revision ? `Import hotov, revize #${revision.id}` : 'Mapa už odpovídá diagramu, nová revize nevznikla');
  console.log(`Popisky přiřazené ke spojům: ${report.linkLabelsMatched}, volné popisky: ${report.freeLabels}`);
  if (report.remoteLinksJoined) console.log(`Spojené vzdálené spoje: ${report.remoteLinksJoined}`);
  if (report.warnings.length) {
    console.log(`\nVarování (${report.warnings.length}):`);
    for (const warning of report.warnings) console.log(`  - ${warning}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
