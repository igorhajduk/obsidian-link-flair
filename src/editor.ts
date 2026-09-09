import { syntaxTree } from '@codemirror/language';
import { StateEffect, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField, setTooltip } from 'obsidian';
import { BARE_LINK_PATTERN, classifyLink, readBracketLink, trimBareUrl, type LinkTarget, type SourceLink } from './links';
import { iconElement } from './render';
import type { MetadataService } from './metadata';

export const refreshFlair = StateEffect.define<null>();
export interface EditorHost {
  metadata: MetadataService;
  showTitles: boolean;
  nativeLinks: boolean;
  references(path: string): ReadonlyMap<string, string>;
  open(target: LinkTarget, sourcePath: string, newLeaf: boolean): void;
  contextMenu(event: MouseEvent, target: LinkTarget, label: string): void;
}

const excluded = /(?:codeblock|code-block|inline-code|frontmatter|comment|hmd-footnote|hmd-table-sep|formatting-link-string)/i;

/** Obsidian's token classes delimit syntax; no custom whole-document parser. */
export function visibleLinks(view: EditorView, references: ReadonlyMap<string, string>): SourceLink[] {
  const tree = syntaxTree(view.state);
  const doc = view.state.doc;
  const links: SourceLink[] = [];
  const blocked: Array<{ from: number; to: number }> = [];
  const seen = new Set<number>();
  const add = (link: SourceLink) => { if (!seen.has(link.from)) { seen.add(link.from); links.push(link); } };
  for (const range of view.visibleRanges) {
    tree.iterate({ from: range.from, to: range.to, enter(node) {
      if (excluded.test(node.name)) { blocked.push({ from: node.from, to: node.to }); return false; }
      if (node.name.includes('formatting-link') && !node.name.includes('image') && doc.sliceString(node.from, node.from + 1) === '[') {
        const offset = node.from;
        if (doc.sliceString(Math.max(0, offset - 1), offset) === '!') return;
        const fragment = doc.sliceString(offset, Math.min(doc.length, offset + 8192));
        const link = readBracketLink(fragment, 0, references);
        if (link && !link.label.includes('![')) add({ ...link, from: link.from + offset, to: link.to + offset, labelFrom: link.labelFrom + offset, labelTo: link.labelTo + offset });
      }
      const parts = node.name.split('_');
      if (parts.includes('url') && !parts.includes('string') && !parts.includes('formatting') && !parts.includes('link')) {
        const href = doc.sliceString(node.from, node.to);
        if (classifyLink(href)) add({ from: node.from, to: node.to, labelFrom: node.from, labelTo: node.to, href, label: href, form: 'bare', internal: false });
      }
      if (node.name.includes('image')) blocked.push({ from: node.from, to: node.to });
    } });
    const text = doc.sliceString(range.from, range.to);
    for (const match of text.matchAll(BARE_LINK_PATTERN)) {
      const from = range.from + match.index;
      if (from > 0 && /[\w\\]/.test(doc.sliceString(from - 1, from))) continue;
      if (blocked.some(block => from >= block.from && from < block.to)) continue;
      if (links.some(link => from >= link.from && from < link.to)) continue;
      const node = tree.resolveInner(from, 1);
      if (excluded.test(node.name) || /(?:link|image|string)/.test(node.name)) continue;
      const href = trimBareUrl(match[0]);
      if (classifyLink(href)) add({ from, to: from + href.length, labelFrom: from, labelTo: from + href.length, href, label: href, form: 'bare', internal: false });
    }
  }
  return links.sort((a, b) => a.from - b.from).filter((link, index, all) => !all.slice(0, index).some(other => other.to > link.from));
}

class FlairIcon extends WidgetType {
  constructor(private target: LinkTarget, private host: EditorHost, private icon: string | undefined, private sourcePath: string) { super(); }
  eq(other: FlairIcon): boolean { return this.target.href === other.target.href && this.target.kind === other.target.kind && this.icon === other.icon && this.sourcePath === other.sourcePath; }
  toDOM(view: EditorView): HTMLElement {
    const el = iconElement(view.dom.ownerDocument, this.target, this.host.metadata);
    el.classList.add('link-flair-editor-icon');
    el.addEventListener('mousedown', event => {
      if (event.button === 0 && (event.metaKey || event.ctrlKey)) { event.preventDefault(); this.host.open(this.target, this.sourcePath, event.shiftKey); }
    });
    return el;
  }
  ignoreEvent(): boolean { return false; }
}

class FlairLabel extends WidgetType {
  constructor(private link: SourceLink, private target: LinkTarget, private host: EditorHost, private label: string, private icon: string | undefined, private sourcePath: string) { super(); }
  eq(other: FlairLabel): boolean { return this.link.from === other.link.from && this.link.to === other.link.to && this.target.href === other.target.href && this.label === other.label && this.icon === other.icon && this.sourcePath === other.sourcePath; }
  toDOM(view: EditorView): HTMLElement {
    const doc = view.dom.ownerDocument;
    const el = (doc.win as typeof window).createEl('a');
    el.className = 'link-flair-link link-flair-replacement';
    el.href = this.target.href;
    el.dataset.linkFlairKind = this.target.kind;
    el.append(iconElement(doc, this.target, this.host.metadata));
    const label = (doc.win as typeof window).createSpan();
    label.className = 'link-flair-label';
    label.textContent = this.label;
    el.append(label);
    setTooltip(el, this.target.href, { delay: 700, placement: 'top', gap: 2 });
    el.addEventListener('click', event => {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey || event.detail === 0) this.host.open(this.target, this.sourcePath, event.shiftKey);
      else {
        view.dispatch({ selection: { anchor: this.link.from }, scrollIntoView: false });
        view.focus();
      }
    });
    el.addEventListener('contextmenu', event => this.host.contextMenu(event, this.target, this.label));
    return el;
  }
  ignoreEvent(): boolean { return true; }
}

export function linkFlairEditor(host: EditorHost) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    private unsubscribe: () => void;
    private frame: number | undefined;
    private disposed = false;
    constructor(private view: EditorView) {
      this.decorations = this.build();
      this.unsubscribe = host.metadata.subscribe(() => {
        if (this.frame !== undefined) return;
        this.frame = this.view.dom.ownerDocument.defaultView!.requestAnimationFrame(() => {
          this.frame = undefined;
          if (!this.disposed) this.view.dispatch({ effects: refreshFlair.of(null) });
        });
      });
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet || syntaxTree(update.startState) !== syntaxTree(update.state) || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshFlair))) || update.startState.field(editorLivePreviewField, false) !== update.state.field(editorLivePreviewField, false)) this.decorations = this.build();
    }
    private build(): DecorationSet {
      const view = this.view;
      if (!view.state.field(editorLivePreviewField, false) || view.composing) return Decoration.none;
      const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
      const decorations: Range<Decoration>[] = [];
      for (const link of visibleLinks(view, host.references(sourcePath))) {
        if (link.internal && !host.nativeLinks) continue;
        const target = classifyLink(link.href, link.internal);
        if (!target) continue;
        if (view.state.selection.ranges.some(range => range.from <= link.to && range.to >= link.from)) continue;
        const needsTitle = link.form === 'bare' && host.showTitles && target.kind === 'web';
        if (target.kind === 'web') host.metadata.ensure(target.href, needsTitle);
        const icon = host.metadata.icon(target.href);
        if (link.form === 'bare' && (target.kind === 'app' || needsTitle)) {
          const label = needsTitle ? host.metadata.title(target.href) ?? target.fallback : target.fallback;
          decorations.push(Decoration.replace({ widget: new FlairLabel(link, target, host, label, icon, sourcePath) }).range(link.from, link.to));
        } else {
          decorations.push(Decoration.mark({ class: 'link-flair-source', inclusiveEnd: true }).range(link.from, link.to));
          decorations.push(Decoration.widget({ widget: new FlairIcon(target, host, icon, sourcePath), side: -1 }).range(link.labelFrom));
          if (link.labelFrom < link.labelTo) decorations.push(Decoration.mark({ class: 'link-flair-editor-label', attributes: { 'data-link-flair-kind': target.kind } }).range(link.labelFrom, link.labelTo));
        }
      }
      return Decoration.set(decorations, true);
    }
    destroy(): void { this.disposed = true; this.unsubscribe(); if (this.frame !== undefined) this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.frame); }
  }, { decorations: value => value.decorations });
}
