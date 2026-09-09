import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const notice = (await readFile('src/assets/NOTICE.txt', 'utf8')).trim();
assert((await readFile('main.js', 'utf8')).includes(notice), 'The built plugin must retain the third-party artwork notice.');

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const directory = `dist/${manifest.id}`;
await mkdir(directory, { recursive: true });
const checksums = [];
for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(name, `${directory}/${name}`);
  checksums.push(`${createHash('sha256').update(await readFile(name)).digest('hex')}  ${name}`);
}
await writeFile(`dist/SHA256SUMS`, `${checksums.join('\n')}\n`);
console.log(`Installable plugin: ${directory}`);
