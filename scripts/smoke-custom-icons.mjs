import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('app://obsidian.md/'));
assert(page);
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`);
const original = await page.evaluate(() => ({ settings: JSON.parse(JSON.stringify(app.plugins.plugins['link-flair'].settings)), view: app.workspace.getMostRecentLeaf().getViewState() }));
const note = 'Custom icons smoke.md';
const markdown = '# Custom icons\n\n[Private issue](https://intranet.test/issues/123)\n\n[Same site](http://intranet.test:8080/other)\n\n[Separate subdomain](https://other.intranet.test/)\n\nclaude://code/new?q=Do%20not%20execute&folder=%2Ftmp%2Fexample\n';
let created = false;
let requests = 0;
const server = createServer((request, response) => {
  requests++;
  response.setHeader('Content-Type', request.url === '/icon.svg' ? 'image/svg+xml' : 'text/html');
  response.end(request.url === '/icon.svg' ? '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#e67e22"/></svg>' : '<html>Sign in</html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
async function surface(selector) {
  for (let i = 0; i < 50; i++) {
    for (const candidate of browser.contexts().flatMap(context => context.pages())) {
      if (await candidate.locator(selector).isVisible().catch(() => false)) return candidate;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Missing UI: ${selector}`);
}
async function settings() {
  await page.evaluate(() => { app.setting.open(); app.setting.openTabById('link-flair'); });
  const ui = await surface('.link-flair-settings-preview');
  await ui.getByPlaceholder('Search settings...').fill('');
  return ui;
}
async function closeSettings() { await page.evaluate(() => app.setting.close()); }
async function expectIcons() {
  for (const mode of ['preview', 'source']) {
    await page.evaluate(async ({ note, mode }) => {
      await app.workspace.getMostRecentLeaf().setViewState({ type: 'markdown', state: { file: note, mode, source: false } });
      if (mode === 'source') app.workspace.getMostRecentLeaf().view.editor.setCursor(0, 0);
    }, { note, mode });
    const scope = mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view';
    await page.waitForFunction(scope => [...document.querySelectorAll(`${scope} .link-flair-icon img`)].filter(image => image.complete && image.naturalWidth > 0).length === 3, scope);
    assert.equal(await page.locator(`${scope} .link-flair-icon svg`).count(), 1, 'The subdomain must retain its fallback');
    assert.equal(await page.locator(`${scope} [data-link-flair-app="Claude Code"]`).count(), 1);
    if (mode === 'preview') assert.deepEqual(await page.locator(`${scope} a.link-flair-link`).evaluateAll(elements => elements.map(element => element.getAttribute('href'))), ['https://intranet.test/issues/123', 'http://intranet.test:8080/other', 'https://other.intranet.test/', 'claude://code/new?q=Do%20not%20execute&folder=%2Ftmp%2Fexample']);
  }
}
try {
  await page.evaluate(async ({ note, markdown }) => {
    if (app.vault.getAbstractFileByPath(note)) throw new Error('Preserve existing smoke note.');
    const plugin = app.plugins.plugins['link-flair'];
    plugin.settings.remoteMetadata = false;
    plugin.settings.customIcons = [];
    await plugin.updateSettings();
    await app.vault.create(note, markdown);
  }, { note, markdown });
  created = true;
  let ui = await settings();
  await ui.getByRole('button', { name: 'Add site icon', exact: true }).click();
  let modal = await surface('.modal:has(.link-flair-custom-status)');
  await modal.getByRole('textbox', { name: 'Link', exact: true }).fill('https://INTRANET.test/issues/123');
  await modal.locator('input[type=file]').setInputFiles('src/assets/claude.png');
  await modal.getByRole('button', { name: 'Save icon', exact: true }).waitFor();
  await modal.waitForFunction(() => document.querySelector('.link-flair-custom-status')?.textContent.startsWith('Ready'));
  await modal.screenshot({ path: 'work/custom-icon-file.png' });
  await modal.getByRole('button', { name: 'Save icon', exact: true }).click();
  await page.waitForFunction(() => app.plugins.plugins['link-flair'].settings.customIcons.length === 1);
  await closeSettings();
  await expectIcons();
  console.log('PASS File import applies to exact private host across schemes and ports in Reading view and Live Preview; bare Claude Code links retain their destination');

  ui = await settings();
  const row = ui.locator('.setting-item').filter({ has: ui.getByText('intranet.test', { exact: true }) });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  modal = await surface('.modal:has(.link-flair-custom-status)');
  await modal.getByRole('textbox', { name: 'Icon from', exact: true }).fill(`${origin}/login`);
  await modal.getByRole('button', { name: 'Get icon', exact: true }).click();
  await modal.waitForFunction(() => document.querySelector('.link-flair-custom-status')?.textContent.startsWith('No usable favicon'));
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.customIcons.length), 1);
  await modal.getByRole('textbox', { name: 'Icon from', exact: true }).fill(`${origin}/icon.svg`);
  await modal.getByRole('button', { name: 'Get icon', exact: true }).click();
  await modal.waitForFunction(() => document.querySelector('.link-flair-custom-status')?.textContent.startsWith('Ready'));
  const dimensions = await modal.locator('.link-flair-custom-preview').evaluate(image => [image.naturalWidth, image.naturalHeight, image.src.startsWith('data:image/png;base64,')]);
  assert.deepEqual(dimensions, [64, 32, true]);
  await modal.getByRole('button', { name: 'Save icon', exact: true }).click();
  await modal.locator('.link-flair-custom-status').waitFor({ state: 'detached' });
  assert.equal(requests, 3);
  await closeSettings();
  await page.evaluate(async () => {
    app.plugins.plugins['link-flair'].metadata.clear();
    await app.plugins.disablePlugin('link-flair');
    await app.plugins.enablePlugin('link-flair');
  });
  await expectIcons();
  const stored = await page.evaluate(async () => (await app.plugins.plugins['link-flair'].loadData()).settings.customIcons);
  assert.equal(stored.length, 1);
  assert(stored[0].icon.startsWith('data:image/png;base64,'));
  assert.equal(requests, 3);
  assert.equal(await page.evaluate(async note => app.vault.read(app.vault.getAbstractFileByPath(note)), note), markdown);
  console.log('PASS Explicit image URL import works with automatic metadata off, rejects HTML, saves a static PNG, and survives cache clearing and reload without further downloads');

  ui = await settings();
  await ui.locator('.setting-item').filter({ has: ui.getByText('intranet.test', { exact: true }) }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForFunction(() => app.plugins.plugins['link-flair'].settings.customIcons.length === 0);
  await closeSettings();
  await page.waitForFunction(() => document.querySelectorAll('.markdown-source-view .link-flair-icon svg').length === 3);
  assert.equal(await page.locator('.markdown-source-view .link-flair-icon img').count(), 1);
  console.log('PASS Removing a custom icon restores default rendering and leaves app artwork intact');
} finally {
  for (const candidate of browser.contexts().flatMap(context => context.pages())) {
    if (await candidate.locator('.modal:has(.link-flair-custom-status)').isVisible().catch(() => false)) await candidate.keyboard.press('Escape');
  }
  await page.evaluate(async ({ original, note, created }) => {
    app.setting.close();
    app.plugins.plugins['link-flair'].settings = original.settings;
    await app.plugins.plugins['link-flair'].updateSettings();
    await app.workspace.getMostRecentLeaf().setViewState(original.view);
    if (created) await app.vault.delete(app.vault.getAbstractFileByPath(note));
  }, { original, note, created });
  await new Promise(resolve => server.close(resolve));
  await browser.close();
}
