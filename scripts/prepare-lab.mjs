import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const vault = path.join(root, '.lab/Flair Lab');
const config = path.join(vault, '.obsidian');
const plugin = path.join(config, 'plugins/link-flair');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--settings-from')) throw new Error('Usage: npm run lab:prepare -- [--settings-from /path/to/source-vault]');
const source = args.length ? path.join(path.resolve(args[1]), '.obsidian') : undefined;
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.id !== 'link-flair') throw new Error('Expected the Link Flair package.');

async function initial(relative, contents) {
  const file = path.join(vault, relative);
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, contents, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

async function optionalJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

// Read and validate a requested source before changing the playground.
const preferences = new Map();
let flairSettings;
if (source) {
  for (const name of ['app.json', 'appearance.json', 'core-plugins.json', 'graph.json', 'hotkeys.json']) {
    const value = await optionalJSON(path.join(source, name), undefined);
    if (value !== undefined) preferences.set(name, JSON.stringify(value, null, 2) + '\n');
  }
  if (!preferences.has('app.json')) throw new Error('The settings source must be an existing Obsidian vault.');
  flairSettings = (await optionalJSON(path.join(source, 'plugins/link-flair/data.json'), {})).settings;
}

await mkdir(plugin, { recursive: true });
for (const name of ['main.js', 'styles.css', 'manifest.json']) await copyFile(path.join(root, name), path.join(plugin, name));
for (const [name, contents] of preferences) await initial(`.obsidian/${name}`, contents);
await initial('.obsidian/app.json', JSON.stringify({ livePreview: true, alwaysUpdateLinks: true }, null, 2) + '\n');
await initial('.obsidian/core-plugins.json', JSON.stringify({ 'file-explorer': true, 'command-palette': true, webviewer: true }, null, 2) + '\n');
if (flairSettings) await initial('.obsidian/plugins/link-flair/data.json', JSON.stringify({ settings: flairSettings }, null, 2) + '\n');
const enabled = await optionalJSON(path.join(config, 'community-plugins.json'), []);
if (!Array.isArray(enabled) || enabled.some(id => typeof id !== 'string')) throw new Error('Invalid community plugin configuration.');
if (!enabled.includes('link-flair')) {
  await writeFile(path.join(config, 'community-plugins.json'), JSON.stringify([...enabled, 'link-flair'], null, 2) + '\n');
}

await initial('Welcome.md', '# Flair Lab\n\nA playground for Link Flair development builds.\n\n## Website icons\n\n- [Telegram](https://t.me/telegram)\n- [YouTube](https://youtu.be/jNQXAC9IVRw)\n- [GitHub](https://github.com)\n- [Obsidian](https://obsidian.md)\n\nCompare Reading view and Live Preview. Source mode intentionally shows ordinary Markdown.\n\n## More examples\n\n- [[Link Flair]] covers authored labels, bare URLs, app deep links, native notes, and formatting.\n- [[Showcase]] provides a compact comparison page.\n\nA stable Link Float release can be installed alongside the development build for integration checks.\n');
for (const name of ['Link Flair.md', 'Showcase.md']) await initial(name, await readFile(path.join(root, 'tests/fixtures', name), 'utf8'));
await initial('Related note.md', '# Details\n\nA local target for navigation.\n\nA referenced block. ^example\n');
console.log(`Prepared ${vault}`);
console.log('Link Flair build updated. Existing settings, notes, and other plugins are preserved.');
console.log('Open this folder as an Obsidian vault; reload Link Flair after updating an open lab.');
