import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarkdownPostProcessorContext } from 'obsidian';
import type { EditorHost } from '../src/editor';
import { MetadataService, type WebResponse } from '../src/metadata';
import { ReadingFlair } from '../src/reading';

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const html = (text: string): WebResponse => ({ status: 200, headers: { 'content-type': 'text/html' }, text, arrayBuffer: new TextEncoder().encode(text).buffer });

// Shaped like Obsidian's Reading-view output for the source below.
const source = 'Read [**bold** label](https://example.com/a), https://example.com/c, [[Note|alias]], and codex://threads/1.\n`codex://threads/2` [code](https://example.com/b)';
const rendered = '<p>Read <a class="external-link" href="https://example.com/a" target="_blank" rel="noopener nofollow"><strong>bold</strong> label</a>, '
  + '<a class="external-link" href="https://example.com/c" target="_blank" rel="noopener nofollow">https://example.com/c</a>, '
  + '<a class="internal-link" data-href="Note" href="Note" target="_blank" rel="noopener nofollow">alias</a>, and codex://threads/1.<br>'
  + '<code>codex://threads/2</code> <code>[code](https://example.com/b)</code></p><pre><code>codex://threads/3</code></pre>';

const children: ReadingFlair[] = [];
afterEach(() => { children.splice(0).forEach(child => child.unload()); document.body.replaceChildren(); });

function render(options: { markdown?: string; host?: Partial<EditorHost>; metadata?: MetadataService } = {}) {
  const element = document.body.appendChild(document.createElement('div'));
  element.innerHTML = rendered;
  const markdown = options.markdown ?? source;
  const context = {
    sourcePath: 'Note.md',
    getSectionInfo: () => ({ text: markdown, lineStart: 0, lineEnd: markdown.split('\n').length - 1 }),
  } as unknown as MarkdownPostProcessorContext;
  const metadata = options.metadata ?? new MetadataService(vi.fn(async () => html('')));
  const host: EditorHost = { metadata, showTitles: true, nativeLinks: true, references: () => new Map(), open: vi.fn(), contextMenu: vi.fn(), ...options.host };
  const child = new ReadingFlair(element, context, host, vi.fn());
  child.load();
  children.push(child);
  const labels = () => [...element.querySelectorAll('.link-flair-link')].map(anchor => [anchor.getAttribute('href'), anchor.querySelector('.link-flair-label')?.textContent]);
  return { element, child, labels };
}

describe('Reading view', () => {
  it('decorates links, keeps authored labels and formatting, and skips code', () => {
    const { element, labels } = render();
    expect(labels()).toEqual([
      ['https://example.com/a', 'bold label'],
      ['https://example.com/c', 'example.com'],
      ['Note', 'alias'],
      ['codex://threads/1', 'Codex'],
    ]);
    expect(element.querySelector('.link-flair-link strong')?.textContent).toBe('bold');
    expect(element.querySelectorAll('code .link-flair-link, pre .link-flair-link')).toHaveLength(0);
    expect(element.querySelectorAll('.link-flair-icon')).toHaveLength(4);
  });

  it('shows a fetched title for a bare web link once it arrives', async () => {
    const request = vi.fn(async (url: string) => html(url === 'https://example.com/c' ? '<title>Fetched page</title>' : ''));
    const { labels } = render({ metadata: new MetadataService(request) });
    await flush();
    expect(labels()[1]).toEqual(['https://example.com/c', 'Fetched page']);
    expect(request).toHaveBeenCalledWith('https://example.com/c');
    expect(request).not.toHaveBeenCalledWith('https://example.com/a');
  });

  it('keeps a bare URL when the same section also links to it with a label', () => {
    const { labels } = render({ markdown: `${source}\n[Elsewhere](https://example.com/c)` });
    expect(labels()[1]).toEqual(['https://example.com/c', 'https://example.com/c']);
  });

  it('leaves native links unchanged when native icons are off', () => {
    const { element } = render({ host: { nativeLinks: false } });
    const native = element.querySelector('.internal-link')!;
    expect(native.classList.contains('link-flair-link')).toBe(false);
    expect(native.innerHTML).toBe('alias');
  });

  it('restores the original rendering exactly on unload', () => {
    const { element, child } = render();
    child.unload();
    expect(element.innerHTML).toBe(rendered);
  });
});
