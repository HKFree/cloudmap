import { cpSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { appVersion } from '../../scripts/app-version.mjs';

/*
 * Bundles the API into self-contained files, so the runtime image needs
 * no node_modules. Swagger UI assets are copied next to the bundle.
 */

const outdir = 'dist';
rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: { server: 'src/server.ts', 'import-dia': 'src/cli/import-dia.ts' },
  outdir,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  legalComments: 'none',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  // Bundled CommonJS dependencies still expect these globals.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __pathDirname(__filename);',
    ].join('\n'),
  },
});

const require = createRequire(import.meta.url);
const swaggerUiDir = dirname(require.resolve('@fastify/swagger-ui/package.json'));
cpSync(join(swaggerUiDir, 'static'), join(outdir, 'static'), { recursive: true });

console.log(`API sestaveno do ${outdir}/ (verze ${appVersion()})`);
