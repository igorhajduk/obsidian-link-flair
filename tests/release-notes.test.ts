// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/release-notes.mjs', import.meta.url));
let directory: string;
const writeJson = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value));
const run = (version = '0.1.3') => spawnSync(process.execPath, [script, version], { cwd: directory, encoding: 'utf8' });

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'link-flair-release-'));
  writeJson('manifest.json', { version: '0.1.3', minAppVersion: '1.13.7' });
  writeJson('package.json', { version: '0.1.3' });
  writeJson('package-lock.json', { version: '0.1.3', packages: { '': { version: '0.1.3' } } });
  writeJson('versions.json', { '0.1.3': '1.13.7' });
  writeFileSync(join(directory, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Future work.\n\n## [0.1.3] - Unreleased\n\n### Fixed\n\n- Preserve exact links.\n\n## [0.1.2]\n\n- Earlier work.\n');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('draft release preparation', () => {
  it('emits only the selected version notes', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('### Fixed\n\n- Preserve exact links.\n');
  });

  it.each(['v0.1.3', '0.1.3-beta', '00.1.3', '0.1.4'])('rejects an invalid or mismatched tag: %s', version => {
    const result = run(version);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it.each([
    ['package.json', { version: '0.1.2' }],
    ['package-lock.json', { version: '0.1.3', packages: { '': { version: '0.1.2' } } }],
    ['versions.json', { '0.1.3': '1.8.7' }],
  ])('rejects inconsistent %s', (name, value) => {
    writeJson(name as string, value);
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it.each([
    '## [0.1.2]\n- Wrong version.\n',
    '## [0.1.3]\n- First.\n## [0.1.3]\n- Duplicate.\n',
    '## [0.1.3]\n\n',
  ])('rejects missing, duplicate, or empty release notes', changelog => {
    writeFileSync(join(directory, 'CHANGELOG.md'), changelog);
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
  });
});
