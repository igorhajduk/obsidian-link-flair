import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const endpoint = process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223';
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('app://obsidian.md/'));
assert(page, 'Start the isolated Obsidian harness first.');
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`, 'Refusing to operate outside the disposable vault.');
const original = await readFile('work/test-vault/Link Flair.md', 'utf8');
const failures = [];
const checks = [];
page.on('pageerror', error => failures.push(String(error)));
const check = name => { checks.push(name); console.log(`PASS ${name}`); };

async function mode(value, source = false) {
  await page.evaluate(async ({ value, source }) => {
    const leaf = app.workspace.getMostRecentLeaf();
    await leaf.setViewState({ type: 'markdown', state: { file: 'Link Flair.md', mode: value, source } });
  }, { value, source });
}

try {
  await page.evaluate(async () => {
    await app.plugins.disablePlugin('link-flair');
    await app.plugins.enablePlugin('link-flair');
    app.plugins.plugins['link-flair'].metadata.setEnabled(false);
  });
  await mode('source');
  await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.setCursor(0, 0));
  await page.waitForFunction(() => document.querySelectorAll('.link-flair-replacement').length >= 5);

  const appLinks = await page.locator('.link-flair-replacement').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), icons: element.querySelectorAll('.link-flair-icon').length, text: element.textContent })));
  for (const scheme of ['codex:', 'chatgpt-conversation:', 'anybox:', 'obsidian:', 'mindnode:', 'zed:', 'things:']) assert(appLinks.some(link => link.href.startsWith(scheme) && link.icons === 1), scheme);
  check('All requested bare app schemes render in Live Preview');
  await page.waitForFunction(() => ['codex:', 'chatgpt-conversation:', 'anybox:', 'obsidian:', 'mindnode:', 'zed:', 'things:'].every(scheme => {
    const image = document.querySelector(`.link-flair-replacement[href^="${scheme}"] .link-flair-icon img`);
    return image?.complete && image.naturalWidth === 128;
  }));
  assert.equal(await page.locator('.link-flair-replacement[href^="other-app:"] .link-flair-icon svg').count(), 1);
  const codexImage = await page.locator('.link-flair-replacement[href^="codex:"] img').getAttribute('src');
  const chatgptImage = await page.locator('.link-flair-replacement[href^="chatgpt-conversation:"] img').getAttribute('src');
  assert.notEqual(codexImage, chatgptImage);
  check('Seven bundled app logos decode offline; Codex and ChatGPT differ; unknown app links get a generic icon');

  assert.equal(await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.getValue()), original);
  check('Rendering preserves the entire Markdown source');

  await page.evaluate(() => {
    const plugin = app.plugins.plugins['link-flair'];
    plugin.testOriginalOpen = plugin.open;
    plugin.testOpened = [];
    plugin.open = (target, sourcePath, newLeaf) => plugin.testOpened.push({ target, sourcePath, newLeaf });
  });
  await page.locator('.link-flair-replacement[href^="things:"]').click({ modifiers: ['Meta'] });
  assert.equal(await page.evaluate(() => app.plugins.plugins['link-flair'].testOpened.at(-1)?.target.href), 'things:///show?id=inbox');
  check('Modifier-click dispatches the exact Things URI without executing it in the test');
  await page.evaluate(() => {
    const plugin = app.plugins.plugins['link-flair'];
    plugin.open = plugin.testOriginalOpen;
    delete plugin.testOriginalOpen;
    delete plugin.testOpened;
  });

  await page.locator('.link-flair-replacement[href^="zed:"]').click();
  const selection = await page.evaluate(() => {
    const editor = app.workspace.getMostRecentLeaf().view.editor;
    return { cursor: editor.getCursor(), line: editor.getLine(editor.getCursor().line), value: editor.getValue() };
  });
  assert(selection.line.includes('zed://file/tmp/example.ts:12:3'));
  assert.equal(selection.value, original);
  assert.equal(await page.locator('.link-flair-replacement[href^="zed:"]').count(), 0);
  check('Normal click reveals editable source without opening the app');

  await page.keyboard.type('X');
  assert((await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.getValue())).includes('Xzed://'));
  await page.keyboard.press('Meta+z');
  assert.equal(await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.getValue()), original);
  await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.setCursor(0, 0));
  await page.waitForFunction(() => document.querySelector('.link-flair-replacement[href^="zed:"]'));
  check('Typing and native undo restore both source and decoration');

  await mode('source', true);
  await page.waitForFunction(() => document.querySelectorAll('.markdown-source-view .link-flair-icon').length === 0);
  check('Source mode has no decorations');

  await mode('preview');
  await page.waitForFunction(() => document.querySelectorAll('.markdown-preview-view .link-flair-link').length >= 29);
  const reading = await page.locator('.markdown-preview-view .link-flair-link').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), icons: element.querySelectorAll('.link-flair-icon').length, text: element.textContent })));
  assert(reading.every(link => link.icons === 1));
  assert(reading.some(link => link.href === 'Related note' && link.text === 'Custom label'));
  assert(reading.some(link => link.href === 'Related note#^example'));
  assert(reading.some(link => link.text === 'the docs' && link.href === 'https://obsidian.md'));
  assert(reading.some(link => link.text === 'https://example.com' && link.href === 'https://example.com'));
  assert.equal(await page.locator('pre .link-flair-icon, code .link-flair-icon').count(), 0);
  assert.equal(await page.locator('.link-flair-link strong').first().textContent(), 'bold');
  check('Reading view preserves authored labels, aliases, references, formatting, and code examples');

  const copied = await page.evaluate(() => {
    const content = document.querySelector('.markdown-preview-view .markdown-preview-sizer');
    const range = document.createRange();
    range.selectNodeContents(content);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const clipboardData = new DataTransfer();
    content.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData }));
    selection.removeAllRanges();
    return { html: clipboardData.getData('text/html'), text: clipboardData.getData('text/plain') };
  });
  assert(copied.html.includes('href="things:///show?id=inbox"'));
  assert(!copied.html.includes('link-flair'));
  assert(copied.text.includes('Codex task'));
  check('Copy across Reading-view sections retains anchors and excludes plugin markup/icons');

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => app.workspace.getMostRecentLeaf().view.previewMode.rerender(true));
    await page.waitForFunction(() => document.querySelectorAll('.markdown-preview-view .link-flair-link').length >= 29);
  }
  assert.equal(await page.locator('.markdown-preview-view .link-flair-icon').count(), reading.length);
  check('Repeated rendering does not duplicate icons');

  await page.locator('.markdown-preview-view a.internal-link[data-href="Related note"]').first().click();
  await page.waitForFunction(() => app.workspace.getMostRecentLeaf().view.file.path === 'Related note.md');
  check('Native Obsidian link navigation opens the actual target note');
  await mode('preview');
  await page.waitForFunction(() => document.querySelectorAll('.markdown-preview-view .link-flair-link').length >= 29);
  await page.screenshot({ path: 'work/reading-verified.png' });

  await page.evaluate(() => app.plugins.disablePlugin('link-flair'));
  assert.equal(await page.locator('.link-flair-icon, .link-flair-link').count(), 0);
  assert.equal(await readFile('work/test-vault/Link Flair.md', 'utf8'), original);
  check('Disabling removes decorations without changing the note');
  assert.deepEqual(failures, [], 'No renderer exceptions');

  await page.evaluate(() => app.plugins.enablePlugin('link-flair'));
  await mode('source');
  await page.evaluate(() => app.workspace.getMostRecentLeaf().view.editor.setCursor(0, 0));
  await page.waitForFunction(() => document.querySelectorAll('.link-flair-icon').length > 0);
  await page.screenshot({ path: 'work/live-preview-verified.png' });
  await writeFile('work/smoke-results.json', JSON.stringify({ obsidian: '1.13.7', checks, errors: failures, sourceUnchanged: true }, null, 2));
} finally {
  await browser.close();
}
