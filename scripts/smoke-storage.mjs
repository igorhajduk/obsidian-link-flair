import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('app://obsidian.md/'));
assert(page, 'Start the isolated Obsidian harness first.');
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`, 'Refusing to operate outside the disposable vault.');
const dataFile = 'work/test-vault/.obsidian/plugins/link-flair/data.json';
const original = await readFile(dataFile, 'utf8');
const title = { key: 'title:https://storage.link-flair.dev/legacy', title: 'Legacy cached title', expires: Date.now() + 86_400_000 };
const check = name => console.log(`PASS ${name}`);

// Runs in the page: read this vault's device cache directly from IndexedDB.
const deviceCache = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(`link-flair-cache:${app.appId}`);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const get = request.result.transaction('cache').objectStore('cache').get('entries');
    get.onsuccess = () => { request.result.close(); resolve(get.result ?? []); };
    get.onerror = () => reject(get.error);
  };
});

async function reload() {
  await page.evaluate(async () => {
    await app.plugins.disablePlugin('link-flair');
    await app.plugins.enablePlugin('link-flair');
  });
}

try {
  const settings = JSON.parse(original).settings ?? {};
  await page.evaluate(async () => {
    await app.plugins.disablePlugin('link-flair');
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(`link-flair-cache:${app.appId}`);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  });
  await writeFile(dataFile, JSON.stringify({ settings: { ...settings, remoteMetadata: false }, cache: [title] }));
  await page.evaluate(() => app.plugins.enablePlugin('link-flair'));
  const migrated = JSON.parse(await readFile(dataFile, 'utf8'));
  assert.deepEqual(Object.keys(migrated), ['settings']);
  assert.equal(migrated.settings.remoteMetadata, false);
  assert.equal(await page.evaluate(href => app.plugins.plugins['link-flair'].metadata.title(href), 'https://storage.link-flair.dev/legacy'), title.title);
  assert((await page.evaluate(deviceCache)).some(entry => entry.key === title.key));
  check('A data.json cache from an earlier version moves to the device cache; data.json keeps only settings');

  await reload();
  assert.equal(await page.evaluate(href => app.plugins.plugins['link-flair'].metadata.title(href), 'https://storage.link-flair.dev/legacy'), title.title);
  check('Cached metadata survives a plugin reload from IndexedDB alone');

  const before = await readFile(dataFile, 'utf8');
  await page.evaluate(() => app.plugins.plugins['link-flair'].metadata.clear());
  for (let attempt = 0; (await page.evaluate(deviceCache)).length; attempt++) {
    assert(attempt < 50, 'The cleared cache was not written to the device.');
    await page.waitForTimeout(100);
  }
  assert.equal(await readFile(dataFile, 'utf8'), before);
  check('Cache changes are written to the device only; data.json is untouched');

  const external = JSON.parse(before);
  external.settings.nativeLinks = !external.settings.nativeLinks;
  external.settings.appearance = { ...external.settings.appearance, fontWeight: 700 };
  await writeFile(dataFile, JSON.stringify(external));
  await page.waitForFunction(expected => {
    const plugin = app.plugins.plugins['link-flair'];
    return plugin.settings.nativeLinks === expected && plugin.settings.appearance.fontWeight === 700
      && document.querySelector('style[data-link-flair-appearance]')?.textContent.includes('--link-flair-font-weight:700');
  }, external.settings.nativeLinks, { timeout: 15_000 });
  assert.equal(await readFile(dataFile, 'utf8'), JSON.stringify(external));
  check('An external data.json change (e.g. Sync) is applied live without being overwritten');
} finally {
  await page.evaluate(() => app.plugins.disablePlugin('link-flair'));
  await writeFile(dataFile, original);
  await page.evaluate(() => app.plugins.enablePlugin('link-flair'));
  await browser.close();
}
