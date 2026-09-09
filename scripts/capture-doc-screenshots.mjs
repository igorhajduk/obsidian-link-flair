import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('app://obsidian.md/'));
assert(page, 'Start the isolated Obsidian harness first.');
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`, 'Only the disposable vault may be used for documentation screenshots.');
const markdown = await readFile('tests/fixtures/Showcase.md', 'utf8');
const original = await page.evaluate(() => ({
  view: app.workspace.getMostRecentLeaf().getViewState(),
  settings: JSON.parse(JSON.stringify(app.plugins.plugins['link-flair'].settings)),
}));
let settingsPage;
let created = false;
try {
  await mkdir('docs/images', { recursive: true });
  await page.evaluate(async markdown => {
    if (app.vault.getAbstractFileByPath('A project, connected.md')) throw new Error('The screenshot note already exists; preserve it and choose a fresh temporary note.');
    await app.vault.create('A project, connected.md', markdown);
  }, markdown);
  created = true;
  await page.evaluate(async () => {
    await app.workspace.getMostRecentLeaf().setViewState({ type: 'markdown', state: { file: 'A project, connected.md', mode: 'preview' } });
    app.workspace.leftSplit.collapse();
    app.workspace.rightSplit.collapse();
    app.plugins.plugins['link-flair'].settings.appearance = { ...app.plugins.plugins['link-flair'].settings.appearance, themeColors: false, darkColor: '#6198ed', darkHover: '#8bb6f7', lightColor: '#2864c7', lightHover: '#174a9c', fontWeight: 500, iconSize: 1, iconGap: 3, iconOpacity: 1, iconBrightness: 1, iconSaturation: 1, appIconScales: {} };
    app.plugins.plugins['link-flair'].updateAppearance();
  });
  await page.setViewportSize({ width: 800, height: 900 });
  const note = page.locator('.workspace-leaf.mod-active .markdown-preview-view');
  await page.waitForFunction(() => app.plugins.plugins['link-flair'].metadata.title('https://obsidian.md'));
  await page.waitForFunction(() => [...document.querySelectorAll('.markdown-preview-view .link-flair-icon img')].length >= 9 && [...document.querySelectorAll('.markdown-preview-view .link-flair-icon img')].every(image => image.complete && image.naturalWidth > 0));
  await note.evaluate(element => { element.scrollTop = 0; });
  const frame = await note.boundingBox();
  assert(frame);
  const clip = { ...frame, height: Math.min(frame.height, 740) };
  await page.screenshot({ path: 'docs/images/links-after.png', clip });
  await page.evaluate(async () => app.plugins.disablePlugin('link-flair'));
  await page.waitForFunction(() => !document.querySelector('.markdown-preview-view .link-flair-icon'));
  await note.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: 'docs/images/links-before.png', clip });
  assert.equal(await page.evaluate(async () => app.vault.read(app.vault.getAbstractFileByPath('A project, connected.md'))), markdown);
  await page.evaluate(async () => {
    await app.plugins.enablePlugin('link-flair');
    app.setting.open();
    app.setting.openTabById('link-flair');
  });
  for (const candidate of browser.contexts().flatMap(context => context.pages())) if (await candidate.locator('.link-flair-settings-preview').count()) settingsPage = candidate;
  assert(settingsPage);
  await settingsPage.getByRole('button', { name: 'Codex icon size', exact: true }).click();
  await settingsPage.getByRole('slider', { name: 'Codex icon size', exact: true }).evaluate(input => {
    input.value = '1.25';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settingsPage.locator('.link-flair-settings-preview').screenshot({ path: 'docs/images/appearance.png' });
  console.log('Captured real Obsidian screenshots from unchanged synthetic Markdown.');
} finally {
  for (const candidate of [page, settingsPage].filter(Boolean)) {
    const session = await candidate.context().newCDPSession(candidate);
    await session.send('Emulation.clearDeviceMetricsOverride');
    await session.detach();
  }
  await page.evaluate(async ({ original, created }) => {
    app.setting.close();
    if (!app.plugins.plugins['link-flair']) await app.plugins.enablePlugin('link-flair');
    const plugin = app.plugins.plugins['link-flair'];
    plugin.settings = original.settings;
    plugin.updateAppearance();
    await plugin.updateSettings();
    await app.workspace.getMostRecentLeaf().setViewState(original.view);
    const note = app.vault.getAbstractFileByPath('A project, connected.md');
    if (created && note) await app.vault.delete(note);
  }, { original, created });
  await browser.close();
}
