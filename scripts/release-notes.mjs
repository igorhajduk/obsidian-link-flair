import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Validate local inputs only. Publishing remains a separate, manual action.
const version = process.argv[2];
assert(version && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), 'Provide an x.y.z release version without a v prefix.');
const readJson = async name => JSON.parse(await readFile(name, 'utf8'));
const [manifest, pkg, lock, versions, changelog] = await Promise.all([
  readJson('manifest.json'), readJson('package.json'), readJson('package-lock.json'), readJson('versions.json'), readFile('CHANGELOG.md', 'utf8'),
]);
assert.equal(manifest.version, version, 'Tag must match manifest.json.');
assert.equal(pkg.version, version, 'Tag must match package.json.');
assert.equal(lock.version, version, 'Tag must match package-lock.json.');
assert.equal(lock.packages[''].version, version, 'Lockfile root package must match the tag.');
assert.equal(versions[version], manifest.minAppVersion, 'versions.json must match minAppVersion.');

const sections = [...changelog.matchAll(/^## \[([^\]\n]+)\][^\n]*\r?$/gm)];
const matches = sections.filter(section => section[1] === version);
assert.equal(matches.length, 1, `Expected exactly one changelog section for ${version}.`);
const section = matches[0];
const next = sections[sections.indexOf(section) + 1];
const notes = changelog.slice(section.index + section[0].length, next?.index).trim();
assert(notes && /^[-*] \S/m.test(notes), 'Release notes must contain at least one change.');
process.stdout.write(`${notes}\n`);
