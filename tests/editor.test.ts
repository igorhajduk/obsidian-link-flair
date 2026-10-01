import { EditorView } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkFlairEditor, linksIn, type EditorHost } from '../src/editor';
import { MetadataService } from '../src/metadata';
import { offsetOf, recordedState, type TokenCase } from './support/editor';

const references = new Map([['ref', 'https://example.com/ref']]);
const found = (name: TokenCase, from = 0, to?: number) => {
  const state = recordedState(name);
  return linksIn(state, [{ from, to: to ?? state.doc.length }], references).map(link => state.doc.sliceString(link.from, link.to));
};

describe('editor link scan on recorded Obsidian tokens', () => {
  it('finds authored, bare, native, and app links but skips code, fences, and images', () => {
    expect(found('links-and-code')).toEqual(['[label](https://example.com/a)', 'https://example.com/c', '[[Note|alias]]', 'codex://threads/1']);
  });

  it('trims bare URL punctuation, resolves references, and skips inline code and definitions', () => {
    expect(found('bare-urls')).toEqual(['https://example.com/x', 'things:///show?id=inbox', '[reference][ref]']);
    const reference = linksIn(recordedState('bare-urls'), [{ from: 0, to: 200 }], references).find(link => link.form === 'markdown');
    expect(reference?.href).toBe('https://example.com/ref');
  });

  it('skips front matter and comments', () => {
    expect(found('hidden-syntax')).toEqual(['https://example.com/visible']);
  });

  it('limits a command to the cursor line and ignores links inside inline code', () => {
    const state = recordedState('links-and-code');
    const line = state.doc.lineAt(0);
    const at = (needle: string) => linksIn(state, [line], references).find(link => {
      const cursor = offsetOf('links-and-code', needle) + 1;
      return link.from <= cursor && cursor <= link.to;
    });
    expect(at('[label]')?.href).toBe('https://example.com/a');
    expect(at('[code]')).toBeUndefined();
    expect(at('https://example.com/b')).toBeUndefined();
    expect(at('[[Note')).toBeUndefined();
  });
});

describe('Live Preview decorations', () => {
  const views: EditorView[] = [];
  afterEach(() => { views.splice(0).forEach(view => view.destroy()); });

  function render(name: TokenCase, options: { livePreview?: boolean; cursor?: number; host?: Partial<EditorHost> } = {}) {
    const metadata = new MetadataService(vi.fn(async () => { throw new Error('offline'); }));
    metadata.setEnabled(false);
    const host: EditorHost = {
      metadata, showTitles: true, nativeLinks: true,
      references: () => references, open: vi.fn(), contextMenu: vi.fn(), ...options.host,
    };
    const plugin = linkFlairEditor(host);
    const state = recordedState(name, [editorLivePreviewField.init(() => options.livePreview ?? true), plugin]);
    const view = new EditorView({ state: options.cursor === undefined ? state : state.update({ selection: { anchor: options.cursor } }).state, parent: document.body });
    views.push(view);
    const ranges: Array<{ from: number; to: number; text: string; kind: string }> = [];
    view.plugin(plugin)!.decorations.between(0, view.state.doc.length, (from, to, value) => {
      const spec = value.spec as { widget?: { constructor: { name: string } }; class?: string };
      ranges.push({ from, to, text: view.state.doc.sliceString(from, to), kind: spec.widget?.constructor.name ?? spec.class ?? '' });
    });
    // Marks and widgets live in separate layers; compare them in document order.
    const decorations = ranges.sort((a, b) => a.from - b.from || a.to - b.to).map(({ text, kind }) => ({ text, kind }));
    return { view, decorations, host };
  }

  it('replaces bare links with labels and marks authored links in place', () => {
    const { decorations } = render('links-and-code');
    expect(decorations).toEqual([
      { text: '[label](https://example.com/a)', kind: 'link-flair-source' },
      { text: '', kind: 'FlairIcon' },
      { text: 'label', kind: 'link-flair-editor-label' },
      { text: 'https://example.com/c', kind: 'FlairLabel' },
      { text: '[[Note|alias]]', kind: 'link-flair-source' },
      { text: '', kind: 'FlairIcon' },
      { text: 'alias', kind: 'link-flair-editor-label' },
      { text: 'codex://threads/1', kind: 'FlairLabel' },
    ]);
  });

  it('reveals the link under the cursor as source', () => {
    const { decorations } = render('links-and-code', { cursor: offsetOf('links-and-code', 'https://example.com/c') + 3 });
    expect(decorations.map(decoration => decoration.text)).not.toContain('https://example.com/c');
    expect(decorations.map(decoration => decoration.text)).toContain('codex://threads/1');
  });

  it('shows the host for bare web links until a title is cached', () => {
    const { view } = render('links-and-code');
    const labels = [...view.dom.querySelectorAll('.link-flair-replacement .link-flair-label')].map(label => label.textContent);
    expect(labels[0]).toBe('example.com');
  });

  it('leaves native links alone when native icons are off, and Source mode untouched', () => {
    expect(render('links-and-code', { host: { nativeLinks: false } }).decorations.map(decoration => decoration.text)).not.toContain('[[Note|alias]]');
    expect(render('links-and-code', { livePreview: false }).decorations).toEqual([]);
  });

  it('opens a replaced link only on modifier click; a plain click reveals its source', () => {
    const { view, host } = render('links-and-code');
    const anchor = view.dom.querySelector<HTMLAnchorElement>('.link-flair-replacement[href^="codex:"]')!;
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(host.open).not.toHaveBeenCalled();
    expect(view.state.selection.main.anchor).toBe(offsetOf('links-and-code', 'codex://'));
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, metaKey: true }));
    expect(host.open).toHaveBeenCalledWith(expect.objectContaining({ href: 'codex://threads/1', kind: 'app' }), '', false);
  });
});
