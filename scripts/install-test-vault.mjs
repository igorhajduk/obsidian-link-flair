import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vault = path.join(root, 'work/test-vault');
const config = path.join(vault, '.obsidian');
const destination = path.join(config, 'plugins/link-flair');
await mkdir(destination, { recursive: true });
for (const name of ['manifest.json', 'main.js', 'styles.css']) {
  await copyFile(path.join(root, name), path.join(destination, name));
}
await writeFile(path.join(config, 'community-plugins.json'), JSON.stringify(['link-flair']));
await writeFile(path.join(config, 'app.json'), JSON.stringify({ livePreview: true, readableLineLength: true }));
try { await access(path.join(vault, 'Link Flair.md')); }
catch { await copyFile(path.join(root, 'tests/fixtures/Link Flair.md'), path.join(vault, 'Link Flair.md')); }
await writeFile(path.join(vault, 'Related note.md'), '# Details\n\nA local target for navigation.\n\nA referenced block. ^example\n');
console.log(`Installed in disposable vault: ${vault}`);
