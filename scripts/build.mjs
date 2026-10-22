// Build script: bundles the two content scripts into self-contained IIFE files
// and copies static assets (manifest, icons) into build/.
//
// Content scripts cannot use runtime ESM imports, so each entry is bundled into
// a single standalone file. Source stays as normal ES modules (good for tests).
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'build');
const watch = process.argv.includes('--watch');

const entries = [
  { in: join(root, 'src/collector.js'), out: 'collector' },
  { in: join(root, 'src/overlay/index.js'), out: 'overlay' },
];

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome111', // content_scripts world:"MAIN" requires Chrome 111+
  logLevel: 'info',
  legalComments: 'none',
};

async function copyStatic() {
  await cp(join(root, 'public'), outdir, { recursive: true });
  if (existsSync(join(root, 'icons'))) {
    await cp(join(root, 'icons'), join(outdir, 'assets/icons'), { recursive: true });
  }
}

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await copyStatic();

  for (const e of entries) {
    const opts = { ...common, entryPoints: [e.in], outfile: join(outdir, `${e.out}.js`) };
    if (watch) {
      const ctx = await context(opts);
      await ctx.watch();
    } else {
      await build(opts);
    }
  }

  if (watch) {
    console.log('[botc-tracker] watching for changes… (re-copy static on manifest edits by restarting)');
  } else {
    console.log('[botc-tracker] build complete -> build/');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
