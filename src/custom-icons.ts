export interface CustomIcon { host: string; url?: string; icon: string }
export const MAX_CUSTOM_ICON_BYTES = 128 * 1024;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** URL rules retain path and query; fragments do not identify a separate page. */
export function customIconUrl(value: string): string | undefined {
  try {
    const input = value.trim();
    if (!input || /\s/.test(input)) return;
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return;
    url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    url.hash = '';
    return url.href;
  } catch { return; }
}

export function customIconKey(icon: Pick<CustomIcon, 'host' | 'url'>): string {
  return icon.url ? `url:${icon.url}` : `host:${icon.host}`;
}

/** Exact host matching: schemes, ports and paths share one site icon. */
export function customIconHost(value: string): string | undefined {
  try {
    const input = value.trim();
    if (!input || /\s/.test(input)) return;
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return url.hostname.toLowerCase().replace(/\.$/, '') || undefined;
  } catch { return; }
}

export function customIconFor(href: string, icons: readonly CustomIcon[]): string | undefined {
  if (!/^https?:\/\//i.test(href)) return;
  const url = customIconUrl(href);
  const exact = url ? icons.find(icon => icon.url === url) : undefined;
  if (exact) return exact.icon;
  const host = customIconHost(href);
  return host ? icons.find(icon => !icon.url && icon.host === host)?.icon : undefined;
}

/** Custom artwork is stored as a small, static PNG, never a remote hotlink. */
export function loadCustomIcons(value: unknown): CustomIcon[] {
  if (!Array.isArray(value)) return [];
  const icons = new Map<string, CustomIcon>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { host, url, icon } = item as Partial<CustomIcon>;
    const exact = typeof url === 'string' ? customIconUrl(url) : undefined;
    if (url !== undefined && !exact) continue;
    const normalized = exact ? customIconHost(exact) : typeof host === 'string' ? customIconHost(host) : undefined;
    if (!normalized || typeof icon !== 'string' || icon.length > MAX_CUSTOM_ICON_BYTES * 1.4 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(icon)) continue;
    const rule: CustomIcon = { host: normalized, ...(exact ? { url: exact } : {}), icon };
    icons.set(customIconKey(rule), rule);
  }
  return [...icons.values()];
}

export async function importIcon(bytes: ArrayBuffer, type: string, doc: Document): Promise<string> {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('Choose an image smaller than 2 MB.');
  const mime = type.split(';')[0]?.trim().toLowerCase();
  if (!mime || !/^image\/(png|jpeg|gif|webp|avif|x-icon|vnd.microsoft.icon|svg\+xml)$/.test(mime)) throw new Error('Choose a PNG, JPEG, SVG, WebP, GIF, AVIF, or ICO image.');
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const image = (doc.win as typeof window).createEl('img');
  let timer: number | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error('The image could not be decoded.')), 10_000);
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image could not be decoded.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192) throw new Error('Choose an image no larger than 8192 × 8192 pixels.');
    const canvas = (doc.win as typeof window).createEl('canvas');
    const scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the icon.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const icon = canvas.toDataURL('image/png');
    if (!loadCustomIcons([{ host: 'preview', icon }]).length) throw new Error('The prepared icon is too large.');
    return icon;
  } finally {
    window.clearTimeout(timer);
    image.onload = image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
