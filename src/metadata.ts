import { publicWebUrl } from './links';

export interface WebResponse { status: number; headers: Record<string, string>; text: string; arrayBuffer: ArrayBuffer }
export type WebRequest = (url: string) => Promise<WebResponse>;
/** Identify metadata requests without reading or sending the device browser identity. */
export function metadataHeaders(): Record<string, string> {
  return {
    Accept: 'text/html,image/*;q=0.9,*/*;q=0.1',
    'User-Agent': 'LinkFlair',
  };
}
export type IconTheme = 'light' | 'dark';
export interface CacheEntry { key: string; expires: number; title?: string; icon?: string; iconDark?: string; iconVersion?: number; iconRetryAfter?: number }
const DAY = 86_400_000;
const MAX_ENTRIES = 128;
const MAX_ICON_BYTES = 128 * 1024;
const MAX_HTML_BYTES = 1024 * 1024;
const NEGATIVE_TTL = 10 * 60_000;
const ICON_VERSION = 2;
const MAX_ICON_CANDIDATES = 3;

export class MetadataService {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<void>>();
  private documents = new Map<string, Promise<Document | undefined>>();
  private listeners = new Set<() => void>();
  private queue: Array<() => void> = [];
  private active = 0;
  private generation = 0;
  private disposed = false;
  enabled = true;

  constructor(private request: WebRequest, entries: readonly unknown[] = []) {
    for (const value of entries.slice(-MAX_ENTRIES)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as CacheEntry;
      if (typeof entry.key !== 'string' || !Number.isFinite(entry.expires) || entry.expires < Date.now()) continue;
      if ([entry.icon, entry.iconDark].some(icon => icon !== undefined && (typeof icon !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon|svg\+xml);base64,/.test(icon) || icon.length > MAX_ICON_BYTES * 1.5))) continue;
      if (entry.title !== undefined && (typeof entry.title !== 'string' || entry.title.length > 512)) continue;
      this.cache.set(entry.key, {
        key: entry.key, expires: entry.expires, title: entry.title, icon: entry.icon, iconDark: entry.iconDark,
        iconVersion: entry.iconVersion === ICON_VERSION ? ICON_VERSION : undefined,
        iconRetryAfter: Number.isFinite(entry.iconRetryAfter) ? Math.min(entry.iconRetryAfter!, Date.now() + NEGATIVE_TTL) : undefined,
      });
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void { for (const listener of this.listeners) listener(); }
  refreshAppearance(): void { this.emit(); }
  snapshot(): CacheEntry[] { return [...this.cache.values()].filter(entry => entry.expires > Date.now()); }

  private entry(key: string): CacheEntry | undefined {
    const value = this.cache.get(key);
    if (value && value.expires < Date.now()) { this.cache.delete(key); return undefined; }
    return value;
  }

  icon(href: string, theme: IconTheme = 'light'): string | undefined {
    const url = publicWebUrl(href);
    const entry = url ? this.entry(`icon:${url.origin}`) : undefined;
    return theme === 'dark' ? entry?.iconDark ?? entry?.icon : entry?.icon;
  }

  title(href: string): string | undefined {
    const url = publicWebUrl(href);
    if (!url) return;
    url.hash = '';
    return this.entry(`title:${url.href}`)?.title;
  }

  ensure(href: string, title: boolean): void {
    if (!this.enabled || this.disposed) return;
    const url = publicWebUrl(href);
    if (!url) return;
    url.hash = '';
    this.ensureIcon(url, title);
    if (!title) return;
    const key = `title:${url.href}`;
    this.load(key, async generation => {
      const doc = await this.document(url.href, generation);
      if (!doc) return {};
      const text = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 512);
      return { title: text || undefined };
    }, DAY);
  }

  private ensureIcon(url: URL, pageTitle: boolean): void {
    const key = `icon:${url.origin}`;
    const previous = this.entry(key);
    const refresh = !!previous && previous.iconVersion !== ICON_VERSION;
    if (refresh && (previous.iconRetryAfter ?? 0) > Date.now()) return;
    this.load(key, async generation => {
      const home = `${url.origin}/`;
      // Authored labels need only the origin. Bare URLs share their page fetch
      // with title loading; a completed low-resolution ICO cannot win a race.
      const pages = pageTitle && url.href !== home ? [url.href, home] : [home];
      const documents = new Map<string, Promise<Document | undefined>>();
      const images = new Map<string, Promise<string | undefined>>();
      const image = (href: string) => {
        if (!images.has(href)) images.set(href, this.fetch(href, generation).then(imageData));
        return images.get(href)!;
      };
      const resolve = async (theme: IconTheme): Promise<{ icon?: string; complete: boolean }> => {
        const attempted = new Set<string>();
        let discovered = false;
        let themedFailure = false;
        for (const page of pages) {
          if (!documents.has(page)) documents.set(page, this.document(page, generation));
          const doc = await documents.get(page);
          if (!doc) continue;
          discovered = true;
          for (const { href, themed } of iconCandidates(doc, page, theme)) {
            if (attempted.has(href)) continue;
            if (attempted.size >= MAX_ICON_CANDIDATES) break;
            attempted.add(href);
            const icon = await image(href);
            if (icon) return { icon, complete: themed || !themedFailure };
            if (themed) themedFailure = true;
          }
          if (attempted.size >= MAX_ICON_CANDIDATES) break;
        }
        const icon = await image(`${url.origin}/favicon.ico`);
        return { icon, complete: discovered && attempted.size === 0 };
      };
      // Resolve both themes together. Shared declarations download only once;
      // switching Obsidian's theme later works entirely from the saved cache.
      const [light, dark] = await Promise.all([resolve('light'), resolve('dark')]);
      if (!light.icon && !dark.icon && (previous?.icon || previous?.iconDark)) {
        return { ...previous, iconRetryAfter: Date.now() + NEGATIVE_TTL };
      }
      const icon = light.icon ?? previous?.icon;
      const iconDark = dark.icon ?? previous?.iconDark;
      return {
        icon, iconDark: iconDark === icon ? undefined : iconDark,
        iconVersion: light.complete && dark.complete ? ICON_VERSION : undefined,
        iconRetryAfter: Date.now() + NEGATIVE_TTL,
      };
    }, 7 * DAY, refresh);
  }

  private document(url: string, generation: number): Promise<Document | undefined> {
    const key = `${generation}:${url}`;
    const existing = this.documents.get(key);
    if (existing) return existing;
    const promise = this.fetch(url, generation).then(response => {
      if (!response || response.status < 200 || response.status >= 300 || response.arrayBuffer.byteLength > MAX_HTML_BYTES || !header(response, 'content-type').includes('text/html')) return;
      return new DOMParser().parseFromString(response.text, 'text/html');
    }).finally(() => this.documents.delete(key));
    this.documents.set(key, promise);
    return promise;
  }

  private load(key: string, loader: (generation: number) => Promise<Partial<CacheEntry>>, ttl: number, refresh = false): void {
    if ((!refresh && this.entry(key)) || this.pending.has(key) || this.pending.size >= MAX_ENTRIES) return;
    const generation = this.generation;
    const promise = loader(generation).catch((): Partial<CacheEntry> => ({})).then(value => {
      if (this.disposed || generation !== this.generation) return;
      const useful = !!(value.title || value.icon || value.iconDark);
      this.cache.set(key, { expires: Date.now() + (useful ? ttl : NEGATIVE_TTL), ...value, key });
      while (this.cache.size > MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
      this.emit();
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise);
  }

  private fetch(url: string, generation: number): Promise<WebResponse | undefined> {
    return new Promise(resolve => {
      const run = () => {
        if (this.disposed || !this.enabled || generation !== this.generation) { resolve(undefined); return; }
        this.active++;
        const timer = window.setTimeout(() => resolve(undefined), 5000);
        // requestUrl has no AbortSignal. A result deadline does not release
        // the concurrency slot; only settlement of the real request does.
        Promise.resolve().then(() => this.request(url)).then(resolve, () => resolve(undefined)).finally(() => {
          window.clearTimeout(timer);
          this.active--;
          this.drain();
        });
      };
      this.queue.push(run);
      this.drain();
    });
  }

  private drain(): void { while (this.active < 4 && this.queue.length) this.queue.shift()!(); }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.generation++;
    this.pending.clear();
    this.drain();
    this.emit();
  }

  clear(): void { this.generation++; this.pending.clear(); this.cache.clear(); this.drain(); this.emit(); }
  dispose(): void { this.disposed = true; this.generation++; this.drain(); this.listeners.clear(); }
}

/** Rank all declarations before limiting requests: large icons often come last. */
function iconCandidates(doc: Document, page: string, theme: IconTheme): Array<{ href: string; themed: boolean }> {
  let base = page;
  try { base = new URL(doc.querySelector('base[href]')?.getAttribute('href') ?? page, page).href; }
  catch { /* Ignore a malformed base URL. */ }
  const candidates: Array<{ href: string; size: number; vector: boolean; themed: boolean }> = [];
  for (const link of doc.querySelectorAll('link[rel][href]')) {
    if (!/(?:^|\s)(?:icon|apple-touch-icon|apple-touch-icon-precomposed)(?:\s|$)/i.test(link.getAttribute('rel') ?? '')) continue;
    const media = link.getAttribute('media')?.trim() ?? '';
    if (!matchesIconMedia(media, theme)) continue;
    const raw = link.getAttribute('href')?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw, base);
      if (!publicWebUrl(url.href)) continue;
      const vector = link.getAttribute('type')?.toLowerCase() === 'image/svg+xml' || /\.svg$/i.test(url.pathname);
      const sizes = (link.getAttribute('sizes') ?? '').toLowerCase().split(/\s+/).flatMap(size => {
        const match = /^(\d+)x(\d+)$/.exec(size);
        return match ? [Math.min(Number(match[1]), Number(match[2]))] : [];
      });
      const candidate = { href: url.href, vector, size: Math.max(0, ...sizes), themed: /prefers-color-scheme/i.test(media) };
      // GitHub declares the light image and exposes a separate official white
      // variant. Keep the original declaration as a fallback.
      if (theme === 'dark' && new URL(page).hostname === 'github.com' && url.origin === 'https://github.githubassets.com' && /^\/favicons\/favicon\.(svg|png)$/.test(url.pathname)) {
        candidates.push({ ...candidate, href: url.href.replace(/\.(svg|png)$/, '-dark.$1'), themed: true });
      }
      candidates.push(candidate);
    } catch { /* Ignore invalid declarations. */ }
  }
  candidates.sort((a, b) => Number(b.themed) - Number(a.themed) || Number(b.vector) - Number(a.vector) || b.size - a.size);
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.href)) return false;
    seen.add(candidate.href);
    return true;
  });
}

/** Substitute the app's scheme, while the browser evaluates the rest of media. */
function matchesIconMedia(media: string, theme: IconTheme): boolean {
  if (!media) return true;
  const query = media.replace(/\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/gi, (_match, scheme: string) => scheme.toLowerCase() === theme ? '(min-width: 0px)' : '(max-width: -1px)');
  return window.matchMedia(query).matches;
}

function header(response: WebResponse, name: string): string {
  return Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1] ?? '';
}

function imageData(response: WebResponse | undefined): string | undefined {
  if (!response || response.status < 200 || response.status >= 300 || response.arrayBuffer.byteLength > MAX_ICON_BYTES) return;
  const type = header(response, 'content-type').split(';')[0]?.trim().toLowerCase();
  if (!type || !/^image\/(png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon|svg\+xml)$/.test(type)) return;
  const bytes = new Uint8Array(response.arrayBuffer);
  let binary = '';
  for (let from = 0; from < bytes.length; from += 8192) binary += String.fromCharCode(...bytes.subarray(from, from + 8192));
  return `data:${type};base64,${btoa(binary)}`;
}
