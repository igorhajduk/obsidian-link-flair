import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('app://obsidian.md/'));
assert(page);
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`);
const original = await page.evaluate(() => JSON.parse(JSON.stringify(app.plugins.plugins['link-flair'].settings.appearance)));
const source = await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.getValue());
let settingsPage;
async function openSettings() {
  await page.evaluate(() => { app.setting.open(); app.setting.openTabById('link-flair'); });
  await page.waitForFunction(() => app.setting.activeTab?.containerEl.isConnected);
  for (const candidate of browser.contexts().flatMap(context => context.pages())) {
    if (await candidate.locator('.link-flair-settings-preview').count()) { settingsPage = candidate; await settingsPage.getByPlaceholder('Search settings...').fill(''); return; }
  }
  throw new Error('Settings window not found');
}
const setting = name => settingsPage.locator('.setting-item').filter({ has: settingsPage.getByText(name, { exact: true }) });
try {
  await openSettings();
  await settingsPage.getByRole('button', { name: 'Reset appearance', exact: true }).click();
  await settingsPage.waitForFunction(() => [...document.querySelectorAll('.link-flair-settings-preview img')].filter(i => i.complete && i.naturalWidth > 0).length === 23);
  assert.equal(await settingsPage.locator('.link-flair-settings-preview svg').count(), 1);
  const visibleApps = await settingsPage.getByRole('button').filter({ has: settingsPage.locator('.link-flair-label') }).allTextContents();
  assert.deepEqual(visibleApps, ['ChatGPT', 'Codex', 'Zed', 'MindNode']);
  assert(await settingsPage.getByRole('button', { name: 'OmniFocus icon size', exact: true }).isHidden());
  const summary = settingsPage.locator('.link-flair-more-apps > summary');
  await summary.focus();
  await settingsPage.keyboard.press('Enter');
  await settingsPage.getByRole('button', { name: 'OmniFocus icon size', exact: true }).click();
  const omniSlider = settingsPage.getByRole('slider', { name: 'OmniFocus icon size', exact: true });
  await omniSlider.focus();
  await settingsPage.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.appIconScales.OmniFocus), 1.05);
  await summary.click();
  await settingsPage.waitForFunction(() => document.querySelector('.link-flair-app-size').hidden);
  await summary.click();
  await settingsPage.getByRole('button', { name: 'OmniFocus icon size', exact: true }).click();
  assert.equal(await settingsPage.getByRole('slider', { name: 'OmniFocus icon size', exact: true }).inputValue(), '1.05');
  await summary.click();
  await settingsPage.waitForFunction(() => document.querySelector('.link-flair-app-size').hidden);
  console.log('PASS All 23 app images decode; only the requested four are initially visible; keyboard expansion, hidden-app sizing, collapse and reopening work');

  const previewLink = settingsPage.getByRole('button', { name: 'Codex icon size', exact: true });
  await previewLink.hover();
  assert.equal(await previewLink.locator('.link-flair-label').evaluate(element => getComputedStyle(element).borderBottomColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await previewLink.evaluate(element => getComputedStyle(element).color), 'rgb(139, 182, 247)');
  await setting('Underline links on hover').locator('.checkbox-container').click();
  await previewLink.hover();
  assert.equal(await previewLink.locator('.link-flair-label').evaluate(element => getComputedStyle(element).borderBottomColor), 'rgb(139, 182, 247)');
  assert.equal(await previewLink.locator('.link-flair-label').evaluate(element => getComputedStyle(element).borderBottomStyle), 'dashed');
  console.log('PASS Hover only changes color by default; the toggle enables dashed underlining immediately');

  const previewIcon = name => settingsPage.locator(`.link-flair-settings-preview [data-link-flair-app="${name}"]`);
  const width = locator => locator.evaluate(element => element.getBoundingClientRect().width);
  const general = await width(previewIcon('Codex'));
  const webIcon = page.locator('.markdown-source-view .link-flair-icon:not([data-link-flair-app])').first();
  const webWidth = await width(webIcon);
  const adjust = async (name, value) => setting(name).locator('input[type=range]').evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  assert(await settingsPage.locator('.link-flair-app-size').isHidden());
  await settingsPage.getByRole('button', { name: 'Codex icon size', exact: true }).click();
  await adjust('Codex icon size', 1.5);
  assert(Math.abs(await width(previewIcon('Codex')) - general * 1.5) < 0.1);
  assert.equal(await width(previewIcon('ChatGPT')), general);
  assert.equal(await width(webIcon), webWidth);
  const editorCodex = page.locator('.markdown-source-view [data-link-flair-app="Codex"]').first();
  assert.equal(await editorCodex.evaluate(element => getComputedStyle(element).getPropertyValue('--link-flair-app-scale')), '1.5');
  await settingsPage.getByRole('button', { name: 'ChatGPT icon size', exact: true }).focus();
  await settingsPage.keyboard.press('Enter');
  await adjust('ChatGPT icon size', 0.75);
  assert(Math.abs(await width(previewIcon('ChatGPT')) - general * 0.75) < 0.1);
  await settingsPage.getByRole('button', { name: 'Reset size', exact: true }).click();
  assert.equal(await width(previewIcon('ChatGPT')), general);
  assert(Math.abs(await width(previewIcon('Codex')) - general * 1.5) < 0.1);
  await settingsPage.getByRole('button', { name: 'Codex icon size', exact: true }).click();
  await setting('Codex icon size').locator('input[type=range]').focus();
  await settingsPage.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.appIconScales.Codex), 1.55);
  await adjust('Icon size', 1.2);
  assert(Math.abs(await width(previewIcon('Codex')) - general * 1.2 * 1.55) < 0.1);
  assert(Math.abs(await width(previewIcon('ChatGPT')) - general * 1.2) < 0.1);
  await adjust('Icon brightness', 0.9);
  await adjust('Icon saturation', 0.8);
  assert.equal(await previewIcon('Codex').evaluate(element => getComputedStyle(element).filter), 'brightness(0.9) saturate(0.8)');
  await settingsPage.screenshot({ path: 'work/app-size-settings-verified.png' });
  console.log('PASS Selecting apps exposes independent size sliders; keyboard, per-app reset, general size, and color filters work; app adjustments leave website sizes unchanged');

  await setting('Icon opacity').locator('input[type=range]').evaluate(input => { input.value = '0.65'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await settingsPage.waitForFunction(() => getComputedStyle(document.querySelector('.link-flair-settings-preview .link-flair-icon')).opacity === '0.65');
  await setting('Link color · dark mode').locator('input[type=color]').evaluate(input => { input.value = '#ab67ef'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
  await settingsPage.waitForFunction(() => getComputedStyle(document.querySelector('.link-flair-settings-preview .link-flair-link')).color === 'rgb(171, 103, 239)');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.link-flair-editor-label .cm-underline')).color === 'rgb(171, 103, 239)');
  console.log('PASS Appearance controls update preview immediately');

  await setting('Use theme link colors').locator('.checkbox-container').click();
  assert(await setting('Link color · dark mode').isHidden());
  const colorMatchesTheme = await settingsPage.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--link-color)';
    document.body.append(probe);
    const match = getComputedStyle(probe).color === getComputedStyle(document.querySelector('.link-flair-settings-preview .link-flair-link')).color;
    probe.remove();
    return match;
  });
  assert(colorMatchesTheme);
  console.log('PASS Theme-color mode follows the vault theme');

  await page.waitForFunction(async () => (await app.plugins.plugins['link-flair'].loadData())?.settings?.appearance?.iconOpacity === 0.65);
  await page.evaluate(async () => { app.setting.close(); await app.plugins.disablePlugin('link-flair'); await app.plugins.enablePlugin('link-flair'); });
  assert.deepEqual(await page.evaluate(() => ({ opacity: app.plugins.plugins['link-flair'].settings.appearance.iconOpacity, color: app.plugins.plugins['link-flair'].settings.appearance.darkColor, theme: app.plugins.plugins['link-flair'].settings.appearance.themeColors })), { opacity: 0.65, color: '#ab67ef', theme: true });
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.underlineOnHover), true);
  console.log('PASS Appearance preferences, including hover underlining, survive a plugin reload');
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.appIconScales.Codex), 1.55);

  await page.evaluate(async () => {
    const leaf = app.workspace.getMostRecentLeaf();
    await leaf.setViewState({ type: 'markdown', state: { file: 'Link Flair.md', mode: 'preview' } });
  });
  const readingCodex = page.locator('.markdown-preview-view [data-link-flair-app="Codex"]').first();
  await readingCodex.waitFor();
  assert.equal(await readingCodex.evaluate(element => getComputedStyle(element).getPropertyValue('--link-flair-app-scale')), '1.55');
  const readingLink = page.locator('.markdown-preview-view a.link-flair-link[href^="codex:"]').first();
  await readingLink.hover();
  assert(await readingLink.locator('.link-flair-label').evaluate(element => getComputedStyle(element).borderBottomColor === getComputedStyle(element).color));
  await page.evaluate(async () => {
    const leaf = app.workspace.getMostRecentLeaf();
    await leaf.setViewState({ type: 'markdown', state: { file: 'Link Flair.md', mode: 'source', source: false } });
  });
  const editorLink = page.locator('.markdown-source-view .link-flair-editor-label').first();
  await editorLink.hover();
  assert(await editorLink.evaluate(element => getComputedStyle(element).borderBottomColor === getComputedStyle(element).color));
  console.log('PASS Optional hover underlining applies in Reading view and Live Preview');
  console.log('PASS Individual app sizes survive reload and apply in Reading view as well as Live Preview');

  await openSettings();
  await settingsPage.getByRole('button', { name: 'Reset appearance', exact: true }).click();
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.iconOpacity), 1);
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.darkColor), '#6198ed');
  assert.deepEqual(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.appIconScales), {});
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.underlineOnHover), false);
  await settingsPage.getByRole('button', { name: 'Codex icon size', exact: true }).hover();
  assert.equal(await settingsPage.getByRole('button', { name: 'Codex icon size', exact: true }).locator('.link-flair-label').evaluate(element => getComputedStyle(element).borderBottomColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.getValue()), source);
  console.log('PASS Reset restores defaults and leaves note contents unchanged');
  await settingsPage.screenshot({ path: 'work/appearance-settings-verified.png' });
  await settingsPage.getByPlaceholder('Search settings...').fill('Icon opacity');
  const searchResult = settingsPage.locator('.setting-search-result-item').filter({ hasText: 'Icon opacity' });
  await searchResult.waitFor();
  await searchResult.click();
  await adjust('Icon opacity', 0.8);
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].settings.appearance.iconOpacity), 0.8);
  console.log('PASS Global settings search finds the plugin control and opens a working opacity slider');

} finally {
  await page.evaluate(appearance => {
    app.setting.close();
    const plugin = app.plugins.plugins['link-flair'];
    plugin.settings.appearance = appearance;
    plugin.updateAppearance();
  }, original);
  await browser.close();
}
