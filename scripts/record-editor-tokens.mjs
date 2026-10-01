import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Records Obsidian's editor syntax tokens for the texts in the fixture, so unit
// tests exercise the real token names without a running app.
const fixture = 'tests/fixtures/editor-tokens.json';
const browser = await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP || 'http://127.0.0.1:19223');
const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('app://obsidian.md/'));
assert(page, 'Start the isolated Obsidian harness first.');
assert.equal(await page.evaluate(() => app.vault.adapter.getBasePath()), `${process.cwd()}/work/test-vault`, 'Refusing to operate outside the disposable vault.');
const data = JSON.parse(await readFile(fixture, 'utf8'));
try {
  for (const entry of Object.values(data.cases)) {
    entry.tokens = await page.evaluate(async text => {
      const file = await app.vault.create('Token recording.md', text);
      const leaf = app.workspace.getLeaf(true);
      try {
        await leaf.openFile(file, { state: { mode: 'source', source: false } });
        const state = leaf.view.editor.cm.state;
        // The language state field holds the parsed tree; plugins resolve the
        // same @codemirror/language instance, this page context does not.
        const language = state.values.find(value => value?.tree?.iterate && value?.context);
        language.context.work(1000, state.doc.length);
        const tokens = [];
        language.context.tree.iterate({ enter(node) { if (node.name !== 'Document') tokens.push([node.from, node.to, node.name]); } });
        return tokens;
      } finally {
        leaf.detach();
        await app.vault.delete(file);
      }
    }, entry.text);
  }
  data.obsidian = await page.evaluate(() => require('electron').ipcRenderer.sendSync('version'));
  await writeFile(fixture, JSON.stringify(data, null, 2) + '\n');
  console.log(`Recorded ${Object.keys(data.cases).length} cases from Obsidian ${data.obsidian}`);
} finally {
  await browser.close();
}
