import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('app://obsidian.md/'));
assert(page, 'Start the isolated Obsidian harness first.');
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`, 'Refusing to operate outside the disposable vault.');
const file = 'Favicon quality check.md';
const markdown = '# Favicon quality\n\n[Telegram](https://t.me/link_flair_example) and [YouTube](https://youtu.be/link_flair_example)\n\nAuthored labels and destinations stay unchanged.\n';
const original = await page.evaluate(() => ({
  view: app.workspace.getMostRecentLeaf().getViewState(),
  settings: JSON.parse(JSON.stringify(app.plugins.plugins['link-flair'].settings)),
  cache: app.plugins.plugins['link-flair'].metadata.snapshot(),
  dark: document.body.classList.contains('theme-dark'),
}));
const client = await page.context().newCDPSession(page);
const report = { before: [], after: [], requests: [], themes: [] };
let created = false;

async function capture(stage, mode, scale) {
  await client.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 600, deviceScaleFactor: scale, mobile: false });
  await page.evaluate(async ({ mode, file }) => {
    const leaf = app.workspace.getMostRecentLeaf();
    await leaf.setViewState({ type: 'markdown', state: { file, mode, source: false } });
    if (mode === 'source') leaf.view.editor.setCursor(4, 0);
  }, { mode, file });
  const selector = `.workspace-leaf.mod-active ${mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view'} .link-flair-icon img`;
  await page.waitForFunction(selector => {
    const images = [...document.querySelectorAll(selector)];
    return images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0);
  }, selector);
  const icons = await page.locator(selector).evaluateAll(images => images.map(image => ({
    type: image.src.split(';')[0], width: image.naturalWidth, height: image.naturalHeight,
    displayWidth: image.getBoundingClientRect().width, displayHeight: image.getBoundingClientRect().height,
  })));
  if (stage === 'before') assert.deepEqual(icons.map(icon => icon.width), [32, 16]);
  else {
    assert.equal(icons[0].type, 'data:image/svg+xml');
    assert.equal(icons[1].type, 'data:image/png');
    assert.equal(icons[1].width, 144);
    assert.equal(icons[1].height, 144);
    assert(icons[1].width >= icons[1].displayWidth * scale);
  }
  const note = page.locator(`.workspace-leaf.mod-active ${mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view'}`);
  await note.screenshot({ path: `work/favicons/${stage}-${mode}-${scale}x.png` });
  report[stage].push({ mode, scale, icons });
}

try {
  await mkdir('work/favicons', { recursive: true });
  await page.evaluate(async ({ markdown, file, settings }) => {
    if (app.vault.getAbstractFileByPath(file)) throw new Error('Temporary fixture already exists.');
    const plugin = app.plugins.plugins['link-flair'];
    const cache = [];
    for (const origin of ['https://t.me', 'https://youtu.be']) {
      const response = await plugin.metadata.request(`${origin}/favicon.ico`);
      if (response.status !== 200) throw new Error(`Legacy favicon failed: ${origin}`);
      let binary = '';
      for (const byte of new Uint8Array(response.arrayBuffer)) binary += String.fromCharCode(byte);
      cache.push({ key: `icon:${origin}`, icon: `data:image/x-icon;base64,${btoa(binary)}`, expires: Date.now() + 86_400_000 });
    }
    await app.plugins.disablePlugin('link-flair');
    await plugin.saveData({ settings: { ...settings, remoteMetadata: false }, cache });
    await app.plugins.enablePlugin('link-flair');
    await app.vault.create(file, markdown);
  }, { markdown, file, settings: original.settings });
  created = true;
  await capture('before', 'preview', 3);
  await page.evaluate(async () => {
    const plugin = app.plugins.plugins['link-flair'];
    const request = plugin.metadata.request;
    plugin.faviconTestRequests = [];
    plugin.metadata.request = url => { plugin.faviconTestRequests.push(url); return request(url); };
    plugin.settings.remoteMetadata = true;
    await plugin.updateSettings();
  });
  await page.waitForFunction(() => {
    const metadata = app.plugins.plugins['link-flair'].metadata;
    return metadata.icon('https://t.me/')?.startsWith('data:image/svg+xml;') && metadata.icon('https://youtu.be/')?.startsWith('data:image/png;');
  }, null, { timeout: 30_000 });
  for (const scale of [1, 2, 3]) for (const mode of ['preview', 'source']) await capture('after', mode, scale);
  report.requests = await page.evaluate(() => app.plugins.plugins['link-flair'].faviconTestRequests);
  assert.equal(report.requests.length, 4, 'Each origin should need one homepage and one declared image request.');
  assert(report.requests.every(url => !url.includes('link_flair_example')), 'Authored link paths must never be fetched.');
  assert.equal(await readFile(`work/test-vault/${file}`, 'utf8'), markdown);
  await page.evaluate(async () => {
    const plugin = app.plugins.plugins['link-flair'];
    plugin.metadata.setEnabled(false);
    const cache = plugin.metadata.snapshot();
    await app.plugins.disablePlugin('link-flair');
    await plugin.saveData({ settings: { ...plugin.settings, remoteMetadata: false }, cache });
    await app.plugins.enablePlugin('link-flair');
    if (app.plugins.plugins['link-flair'].metadata.enabled) throw new Error('Offline reload did not retain the remote metadata switch.');
  });
  await capture('after', 'preview', 3);

  const themeMarkdown = '# Favicon themes\n\n[GitHub](https://github.com/link-flair-example)\n\nAn authored link for theme checks.\n';
  await page.evaluate(async ({ file, markdown }) => {
    const plugin = app.plugins.plugins['link-flair'];
    await app.vault.modify(app.vault.getAbstractFileByPath(file), markdown);
    plugin.settings.remoteMetadata = true;
    await plugin.updateSettings();
  }, { file, markdown: themeMarkdown });
  await page.waitForFunction(() => {
    const m = app.plugins.plugins['link-flair'].metadata;
    return m.icon('https://github.com/', 'dark') && m.icon('https://github.com/', 'dark') !== m.icon('https://github.com/', 'light');
  }, null, { timeout: 30_000 });
  await page.evaluate(async () => {
    const plugin = app.plugins.plugins['link-flair'];
    const cache = plugin.metadata.snapshot();
    await app.plugins.disablePlugin('link-flair');
    await plugin.saveData({ settings: { ...plugin.settings, remoteMetadata: false }, cache });
    await app.plugins.enablePlugin('link-flair');
    if (app.plugins.plugins['link-flair'].metadata.enabled) throw new Error('Theme checks must run offline.');
  });
  for (const theme of ['dark', 'light', 'dark']) {
    const system = theme === 'dark' ? 'light' : 'dark';
    await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: system }] });
    await page.evaluate(theme => {
      document.body.classList.toggle('theme-dark', theme === 'dark');
      document.body.classList.toggle('theme-light', theme === 'light');
    }, theme);
    for (const mode of ['preview', 'source']) {
      await page.evaluate(async ({ file, mode }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        await leaf.setViewState({ type: 'markdown', state: { file, mode, source: false } });
        if (mode === 'source') leaf.view.editor.setCursor(4, 0);
      }, { file, mode });
      const selector = `.workspace-leaf.mod-active ${mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view'} .link-flair-icon img`;
      await page.waitForFunction(({ selector, theme }) => {
        const image = document.querySelector(selector);
        return image?.complete && image.naturalWidth > 0 && image.src === app.plugins.plugins['link-flair'].metadata.icon('https://github.com/', theme);
      }, { selector, theme });
      const result = await page.locator(selector).evaluate(image => ({
        svg: atob(image.src.split(',')[1]), scheme: getComputedStyle(image).colorScheme,
        systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
      }));
      assert(result.svg.includes(theme === 'dark' ? 'fill="white"' : 'fill="#24292E"'));
      assert.equal(result.scheme, theme);
      assert.equal(result.systemDark, system === 'dark');
      report.themes.push({ theme, mode, system, color: theme === 'dark' ? 'white' : '#24292E' });
      await page.locator(`.workspace-leaf.mod-active ${mode === 'preview' ? '.markdown-preview-view' : '.markdown-source-view'}`).screenshot({ path: `work/favicons/theme-${theme}-${mode}.png` });
    }
  }
  assert.equal(await readFile(`work/test-vault/${file}`, 'utf8'), themeMarkdown);
  // Exercise actual browser media evaluation with the OS still opposite to the app.
  const media = await page.evaluate(async () => {
    const Service = app.plugins.plugins['link-flair'].metadata.constructor;
    const response = (text, type = 'text/html') => ({ status: 200, headers: { 'content-type': type }, text, arrayBuffer: new TextEncoder().encode(text).buffer });
    const service = new Service(async url => url.endsWith('.svg') ? response(url, 'image/svg+xml') : response('<link rel="icon" href="/light.svg" media="(prefers-color-scheme: light)"><link rel="icon" href="/dark.svg" media="screen and (prefers-color-scheme: dark)">'));
    service.ensure('https://example.com/', false);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    const values = ['light', 'dark'].map(theme => atob(service.icon('https://example.com/', theme).split(',')[1]));
    service.dispose();
    return values;
  });
  assert.deepEqual(media, ['https://example.com/light.svg', 'https://example.com/dark.svg']);
  await writeFile('work/favicons/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('PASS legacy cache upgrade: Telegram 32px ICO to SVG, YouTube 16px ICO to 144px PNG');
  console.log('PASS Reading view and Live Preview at 1x/2x/3x density, unchanged Markdown and authored-link request scope');
  console.log('PASS upgraded images persist across an offline plugin reload');
  console.log('PASS GitHub variants persist offline and follow the app theme in both modes when the OS uses the opposite scheme');
  console.log('PASS browser evaluation selects declared light/dark media variants independently of the OS scheme');
} finally {
  await client.send('Emulation.clearDeviceMetricsOverride');
  await client.send('Emulation.setEmulatedMedia', { features: [] });
  await page.evaluate(async ({ original, file, created }) => {
    document.body.classList.toggle('theme-dark', original.dark);
    document.body.classList.toggle('theme-light', !original.dark);
    const plugin = app.plugins.plugins['link-flair'];
    await app.plugins.disablePlugin('link-flair');
    await plugin.saveData({ settings: original.settings, cache: original.cache });
    await app.plugins.enablePlugin('link-flair');
    await app.workspace.getMostRecentLeaf().setViewState(original.view);
    if (created) {
      const fixture = app.vault.getAbstractFileByPath(file);
      if (fixture) await app.vault.delete(fixture);
    }
  }, { original, file, created });
  await browser.close();
}
