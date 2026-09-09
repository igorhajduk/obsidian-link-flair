import { MarkdownRenderChild, setTooltip, type MarkdownPostProcessorContext } from 'obsidian';
import { BARE_LINK_PATTERN, classifyLink, readBracketLink, trimBareUrl, type LinkTarget } from './links';
import type { EditorHost } from './editor';
import { iconElement } from './render';

interface DecoratedLink {
  anchor: HTMLAnchorElement;
  target: LinkTarget;
  original: Node[];
  label: HTMLElement;
  icon: HTMLElement;
  title: string | null;
  ariaLabel: string | null;
  tooltipPosition: string | null;
  needsTitle: boolean;
}

/** Ambiguous provenance preserves the authored text rather than replacing it. */
export function authoredDestinations(source: string, references: ReadonlyMap<string, string>): Set<string> {
  const result = new Set<string>();
  for (let cursor = source.indexOf('['); cursor >= 0; cursor = source.indexOf('[', cursor + 1)) {
    const link = readBracketLink(source, cursor, references);
    if (link) { result.add(link.href); cursor = link.to - 1; }
  }
  return result;
}

export class ReadingFlair extends MarkdownRenderChild {
  private links: DecoratedLink[] = [];
  private generated: HTMLAnchorElement[] = [];
  private observer?: IntersectionObserver;
  private unsubscribe?: () => void;
  private cleaned = false;
  constructor(element: HTMLElement, private context: MarkdownPostProcessorContext, private host: EditorHost, private onDispose: () => void) { super(element); }

  onload(): void {
    const element = this.containerEl;
    const doc = element.ownerDocument;
    const info = this.context.getSectionInfo(element);
    const source = info?.text.split('\n').slice(info.lineStart, info.lineEnd + 1).join('\n');
    const authored = source === undefined ? null : authoredDestinations(source, this.host.references(this.context.sourcePath));
    this.linkifyAppText();
    const Observer = doc.defaultView?.IntersectionObserver;
    if (Observer) this.observer = new Observer(entries => {
      for (const entry of entries) {
        const link = this.links.find(link => link.anchor === entry.target);
        if (link && entry.isIntersecting && link.target.kind === 'web') this.host.metadata.ensure(link.target.href, link.needsTitle);
      }
    });
    for (const anchor of element.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (anchor.closest('pre, code, .link-flair-link, .internal-embed') || anchor.querySelector('img, svg, .link-favicon')) continue;
      const internal = anchor.classList.contains('internal-link');
      if (internal && !this.host.nativeLinks) continue;
      const href = internal ? anchor.dataset.href ?? anchor.getAttribute('href') : anchor.getAttribute('href');
      if (!href) continue;
      const target = classifyLink(href, internal);
      if (!target) continue;
      const original = [...anchor.childNodes];
      const originalText = anchor.textContent ?? '';
      const label = (doc.win as typeof window).createSpan();
      label.className = 'link-flair-label';
      label.append(...original);
      const icon = iconElement(doc, target, this.host.metadata);
      const needsTitle = target.kind === 'web' && this.host.showTitles && originalText === href && authored !== null && !authored.has(href);
      const link: DecoratedLink = { anchor, target, original, label, icon, title: anchor.getAttribute('title'), ariaLabel: anchor.getAttribute('aria-label'), tooltipPosition: anchor.getAttribute('data-tooltip-position'), needsTitle };
      anchor.classList.add('link-flair-link');
      anchor.dataset.linkFlairKind = target.kind;
      anchor.append(icon, label);
      if (!internal) setTooltip(anchor, href, { delay: 700, placement: 'top', gap: 2 });
      this.links.push(link);
      this.updateLink(link);
      if (this.observer) this.observer.observe(anchor);
      else if (target.kind === 'web') this.host.metadata.ensure(href, needsTitle);
    }
    this.unsubscribe = this.host.metadata.subscribe(() => this.links.forEach(link => this.updateLink(link)));
  }

  private updateLink(link: DecoratedLink): void {
    if (this.cleaned) return;
    const replacement = iconElement(link.anchor.ownerDocument, link.target, this.host.metadata);
    if (replacement.innerHTML !== link.icon.innerHTML) { link.icon.replaceWith(replacement); link.icon = replacement; }
    if (link.needsTitle) link.label.textContent = this.host.metadata.title(link.target.href) ?? link.target.fallback;
    if (link.anchor.dataset.linkFlairGenerated === 'true') link.label.textContent = link.target.fallback;
  }

  private linkifyAppText(): void {
    const doc = this.containerEl.ownerDocument;
    const walker = doc.createTreeWalker(this.containerEl, 4);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      if (!text.parentElement?.closest('a, pre, code, script, style, svg, textarea, .math, .mermaid, .internal-embed, .link-flair-link')) nodes.push(text);
    }
    for (const text of nodes) {
      const matches = [...text.data.matchAll(BARE_LINK_PATTERN)].filter(match => classifyLink(trimBareUrl(match[0]))?.kind === 'app');
      if (!matches.length) continue;
      const fragment = (doc.win as typeof window).createFragment();
      let cursor = 0;
      for (const match of matches) {
        if (match.index > 0 && /[\w\\]/.test(text.data[match.index - 1]!)) continue;
        const href = trimBareUrl(match[0]);
        fragment.append(doc.createTextNode(text.data.slice(cursor, match.index)));
        const anchor = (doc.win as typeof window).createEl('a');
        anchor.href = href;
        anchor.className = 'external-link';
        anchor.dataset.linkFlairGenerated = 'true';
        anchor.textContent = href;
        fragment.append(anchor);
        this.generated.push(anchor);
        cursor = match.index + href.length;
      }
      if (!cursor) continue;
      fragment.append(doc.createTextNode(text.data.slice(cursor)));
      text.replaceWith(fragment);
    }
  }

  cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.unsubscribe?.();
    this.observer?.disconnect();
    for (const { anchor, original, title, ariaLabel, tooltipPosition } of this.links) {
      anchor.replaceChildren(...original);
      anchor.classList.remove('link-flair-link');
      delete anchor.dataset.linkFlairKind;
      if (title === null) anchor.removeAttribute('title'); else anchor.setAttribute('title', title);
      if (ariaLabel === null) anchor.removeAttribute('aria-label'); else anchor.setAttribute('aria-label', ariaLabel);
      if (tooltipPosition === null) anchor.removeAttribute('data-tooltip-position'); else anchor.setAttribute('data-tooltip-position', tooltipPosition);
    }
    for (const anchor of this.generated) anchor.replaceWith(anchor.ownerDocument.createTextNode(anchor.getAttribute('href') ?? ''));
    this.onDispose();
  }
  onunload(): void { this.cleanup(); }
}
