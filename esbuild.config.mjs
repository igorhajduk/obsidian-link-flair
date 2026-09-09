import esbuild from 'esbuild';
import { readFile } from 'node:fs/promises';

const artworkNotice = await readFile(new URL('./src/assets/NOTICE.txt', import.meta.url), 'utf8');

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2022',
  platform: 'browser',
  loader: { '.png': 'dataurl', '.svg': 'dataurl' },
  external: ['obsidian', '@codemirror/*', '@lezer/*'],
  outfile: 'main.js',
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  banner: { js: `/*!\n${artworkNotice.trim()}\n*/` },
  logLevel: 'info',
});

if (process.argv.includes('--watch')) await context.watch();
else {
  await context.rebuild();
  await context.dispose();
}
