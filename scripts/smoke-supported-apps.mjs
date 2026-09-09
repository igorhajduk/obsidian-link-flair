import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('app://obsidian.md/'));
assert(page);
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`);
const source = await readFile('tests/fixtures/Supported apps.md', 'utf8');
const examples = [...source.matchAll(/^- \[([^\]]+)\]\(<([^>]+)>\)$/gm)].map(([, name, href]) => ({ name, href }));
assert.equal(examples.length, 17);
const original = await page.evaluate(() => ({ view: app.workspace.getMostRecentLeaf().getViewState(), enabled: app.plugins.plugins['link-flair'].metadata.enabled }));
const path = 'Supported apps smoke.md';
let created = false;
try {
  await page.evaluate(async ({ path, source }) => {
    if (app.vault.getAbstractFileByPath(path)) throw new Error('Preserve the existing smoke note.');
    app.plugins.plugins['link-flair'].metadata.setEnabled(false);
    await app.vault.create(path, source);
  }, { path, source });
  created = true;
  await page.setViewportSize({ width: 1100, height: 1400 });
  for (const mode of ['preview', 'source']) {
    await page.evaluate(async ({ path, mode }) => {
      await app.workspace.getMostRecentLeaf().setViewState({ type: 'markdown', state: { file: path, mode, source: false } });
      if (mode === 'source') app.workspace.getMostRecentLeaf().view.editor.setCursor(0, 0);
    }, { path, mode });
    const scope = mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view';
    await page.waitForFunction(({ scope, count }) => [...document.querySelectorAll(`${scope} .link-flair-icon img`)].filter(image => image.complete && image.naturalWidth > 0).length === count, { scope, count: examples.length });
    const rendered = await page.locator(`${scope} [data-link-flair-app]`).evaluateAll(elements => elements.map(element => element.dataset.linkFlairApp));
    assert.deepEqual(rendered, examples.map(example => example.name));
    if (mode === 'preview') {
      const links = await page.locator(`${scope} a.link-flair-link`).evaluateAll(elements => elements.map(element => ({ name: element.textContent, href: element.getAttribute('href') })));
      assert.deepEqual(links, examples);
    }
    assert.equal(await page.evaluate(async path => app.vault.read(app.vault.getAbstractFileByPath(path)), path), source);
    console.log(`PASS New app destinations and all nine IDE identities render offline in ${mode === 'preview' ? 'Reading view' : 'Live Preview'}; original Markdown remains unchanged`);
  }
} finally {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.clearDeviceMetricsOverride');
  await session.detach();
  await page.evaluate(async ({ original, path, created }) => {
    app.plugins.plugins['link-flair'].metadata.setEnabled(original.enabled);
    await app.workspace.getMostRecentLeaf().setViewState(original.view);
    if (created) await app.vault.delete(app.vault.getAbstractFileByPath(path));
  }, { original, path, created });
  await browser.close();
}
