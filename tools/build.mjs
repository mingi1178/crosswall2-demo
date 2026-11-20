import { build } from 'esbuild';

// A classic script and an embedded worker also run when index.html opens via file://.
const options = { bundle: true, format: 'iife', minify: true, target: 'es2020' };
const worker = await build({
  ...options,
  entryPoints: ['web/prepare-board.js'],
  write: false,
});
await build({
  ...options,
  entryPoints: ['web/app.js'],
  define: { BOARD_WORKER_SOURCE: JSON.stringify(worker.outputFiles[0].text) },
  outfile: 'web/game.bundle.js',
});
