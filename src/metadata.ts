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
export interface CacheEntry { key: string; expires: number; title?: string; icon?: string }
const DAY = 86_400_000;
const MAX_ENTRIES = 128;
const MAX_ICON_BYTES = 128 * 1024;
const MAX_HTML_BYTES = 1024 * 1024;
const NEGATIVE_TTL = 10 * 60_000;

export class MetadataService {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<void>>();
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
      if (entry.icon !== undefined && (typeof entry.icon !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon|svg\+xml);base64,/.test(entry.icon) || entry.icon.length > MAX_ICON_BYTES * 1.5)) continue;
      if (entry.title !== undefined && (typeof entry.title !== 'string' || entry.title.length > 512)) continue;
      this.cache.set(entry.key, entry);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void { for (const listener of this.listeners) listener(); }
  snapshot(): CacheEntry[] { return [...this.cache.values()].filter(entry => entry.expires > Date.now()); }

  private entry(key: string): CacheEntry | undefined {
    const value = this.cache.get(key);
    if (value && value.expires < Date.now()) { this.cache.delete(key); return undefined; }
    return value;
  }

  icon(href: string): string | undefined {
    const url = publicWebUrl(href);
    return url ? this.entry(`icon:${url.origin}`)?.icon : undefined;
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
    this.ensureIcon(url);
    if (!title) return;
    url.hash = '';
    const key = `title:${url.href}`;
    this.load(key, async generation => {
      const response = await this.fetch(url.href, generation);
      if (!response || response.status < 200 || response.status >= 300) return {};
      if (!header(response, 'content-type').includes('text/html') || response.arrayBuffer.byteLength > MAX_HTML_BYTES) return {};
      const doc = new DOMParser().parseFromString(response.text, 'text/html');
      const text = (doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 512);
      const declaredIcon = [...doc.querySelectorAll('link[rel]')].find(link => /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(link.getAttribute('rel') ?? ''))?.getAttribute('href');
      if (declaredIcon && generation === this.generation) {
        try {
          const iconUrl = new URL(declaredIcon, url);
          if (publicWebUrl(iconUrl.href)) this.ensureIcon(url, iconUrl.href);
        } catch { /* A broken icon declaration leaves the origin fallback. */ }
      }
      return { title: text || undefined };
    }, DAY);
  }

  private ensureIcon(url: URL, declared?: string): void {
    const key = `icon:${url.origin}`;
    if (declared && this.entry(key) && !this.entry(key)?.icon) this.cache.delete(key);
    this.load(key, async generation => {
      let icon = imageData(await this.fetch(declared ?? `${url.origin}/favicon.ico`, generation));
      if (icon || declared) return { icon };
      // Sites increasingly declare PNG/SVG icons instead of /favicon.ico.
      // Discover these at the origin, without fetching an authored link's path.
      const home = await this.fetch(`${url.origin}/`, generation);
      if (!home || home.status < 200 || home.status >= 300 || home.arrayBuffer.byteLength > MAX_HTML_BYTES || !header(home, 'content-type').includes('text/html')) return {};
      const doc = new DOMParser().parseFromString(home.text, 'text/html');
      const candidates = [...doc.querySelectorAll('link[rel]')].filter(link => /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(link.getAttribute('rel') ?? '')).slice(0, 3);
      for (const candidate of candidates) {
        try {
          const href = new URL(candidate.getAttribute('href') ?? '', `${url.origin}/`).href;
          if (!publicWebUrl(href) || href === `${url.origin}/favicon.ico`) continue;
          icon = imageData(await this.fetch(href, generation));
          if (icon) break;
        } catch { /* Invalid declarations leave the generic fallback. */ }
      }
      return { icon };
    }, 7 * DAY);
  }

  private load(key: string, loader: (generation: number) => Promise<Partial<CacheEntry>>, ttl: number): void {
    if (this.entry(key) || this.pending.has(key) || this.pending.size >= MAX_ENTRIES) return;
    const generation = this.generation;
    const promise = loader(generation).catch((): Partial<CacheEntry> => ({})).then(value => {
      if (this.disposed || generation !== this.generation) return;
      const useful = !!(value.title || value.icon);
      this.cache.set(key, { key, ...value, expires: Date.now() + (useful ? ttl : NEGATIVE_TTL) });
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
