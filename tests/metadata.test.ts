import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetadataService, metadataHeaders, type WebResponse } from '../src/metadata';

function response(text: string, type = 'text/html', status = 200): WebResponse {
  return { status, headers: { 'content-type': type }, text, arrayBuffer: new TextEncoder().encode(text).buffer };
}
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('metadata lifecycle', () => {
  it('resolves Teams-style icons when the embedded client is rejected by the site', async () => {
    const headers = metadataHeaders();
    expect(headers['User-Agent']).toBe('LinkFlair');
    const request = vi.fn(async (url: string) => {
      if (/obsidian|Electron/i.test(headers['User-Agent']!)) return response('<title>Microsoft Teams - Error</title>');
      if (url === 'https://cdn.example.com/teams.ico') return response('pixels', 'image/x-icon');
      if (url.endsWith('/favicon.ico')) return response('<title>Microsoft Teams - Error</title>');
      return response('<link rel="shortcut icon" href="https://cdn.example.com/teams.ico">');
    });
    const service = new MetadataService(request);
    service.ensure('https://teams.microsoft.com/l/message/private?context=private', false);
    await flush();
    await flush();
    expect(service.icon('https://teams.microsoft.com/')).toMatch(/^data:image\/x-icon;base64,/);
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://teams.microsoft.com/', 'https://cdn.example.com/teams.ico']);
  });
  it('ignores corrupt cache records and remote image URLs', () => {
    const service = new MetadataService(vi.fn(), [null, 7, { key: 'icon:https://example.com', expires: Date.now() + 10_000, icon: 'https://tracker.example/image' }]);
    expect(service.snapshot()).toEqual([]);
  });
  it('deduplicates requests across repeated links and views', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('/favicon.ico') ? response('icon', 'image/x-icon') : response('<title>A page</title>'));
    const service = new MetadataService(request);
    for (let i = 0; i < 100; i++) service.ensure('https://example.com/page#part', true);
    await flush();
    expect(request).toHaveBeenCalledTimes(3);
    expect(service.title('https://example.com/page#other')).toBe('A page');
    expect(request.mock.calls.every(call => !String(call[0]).includes('#'))).toBe(true);
  });
  it('never requests metadata for app URLs', async () => {
    const request = vi.fn();
    const service = new MetadataService(request);
    for (const href of ['things:///add?title=Task', 'obsidian://open?file=A', 'codex://threads/id', 'mindnode://open?id=a', 'zed://file/a', 'chatgpt-conversation://id', 'anybox://item/id', 'other-app://id']) service.ensure(href, true);
    await flush();
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps concurrency bounded even after the UI deadline', async () => {
    vi.useFakeTimers();
    const pending: Array<(value: WebResponse) => void> = [];
    const request = vi.fn(() => new Promise<WebResponse>(resolve => pending.push(resolve)));
    const service = new MetadataService(request);
    for (let i = 0; i < 12; i++) service.ensure(`https://site${i}.com`, false);
    await flush();
    expect(request).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(6000);
    expect(request).toHaveBeenCalledTimes(4);
    pending[0]!(response('', 'text/plain', 404));
    await flush();
    expect(request).toHaveBeenCalledTimes(5);
    service.dispose();
    for (const resolve of pending) resolve(response('', 'text/plain', 404));
    await flush();
  });
  it('discards late responses after metadata is disabled', async () => {
    const pending: Array<(value: WebResponse) => void> = [];
    const service = new MetadataService(() => new Promise<WebResponse>(resolve => pending.push(resolve)));
    service.ensure('https://example.com', true);
    await flush();
    service.setEnabled(false);
    for (const resolve of pending) resolve(response('<title>Late title</title>'));
    await flush();
    expect(service.title('https://example.com')).toBeUndefined();
    expect(service.snapshot()).toEqual([]);
  });
  it('treats HTML metadata as plain text and prefers Open Graph', async () => {
    const service = new MetadataService(async () => response('<meta property="og:title" content="A &amp; B"><title>Other</title>'));
    service.ensure('https://example.com', true);
    await flush();
    expect(service.title('https://example.com')).toBe('A & B');
  });
  it('negative-caches failures instead of fetching on every render', async () => {
    const request = vi.fn(async () => response('', 'text/html', 403));
    const service = new MetadataService(request);
    service.ensure('https://example.com', true);
    await flush();
    service.ensure('https://example.com', true);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(service.title('https://example.com')).toBeUndefined();
  });
  it('discovers a declared favicon from the origin when favicon.ico is missing', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('/favicon.ico')) return response('', 'text/plain', 404);
      if (url.endsWith('/brand.png')) return response('pixels', 'image/png');
      return response('<link rel="icon" href="/brand.png">');
    });
    const service = new MetadataService(request);
    service.ensure('https://example.com/private/path?query=kept', false);
    await flush();
    await flush();
    expect(service.icon('https://example.com/another')).toMatch(/^data:image\/png;base64,/);
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/', 'https://example.com/brand.png']);
  });
  it('uses valid persisted titles while offline', () => {
    const request = vi.fn();
    const service = new MetadataService(request, [{ key: 'title:https://example.com/', title: 'Saved title', expires: Date.now() + 10_000 }]);
    service.setEnabled(false);
    service.ensure('https://example.com', true);
    expect(service.title('https://example.com')).toBe('Saved title');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('favicon quality', () => {
  const oldIcon = 'data:image/png;base64,b2xk';
  const legacy = () => ({ key: 'icon:https://example.com', icon: oldIcon, expires: Date.now() + 86_400_000 });

  it('prefers Telegram-style SVG declarations over a working low-resolution ICO', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('.svg')) return response('<svg/>', 'image/svg+xml');
      if (url.endsWith('.ico')) return response('small', 'image/x-icon');
      return response('<link rel="apple-touch-icon" sizes="180x180" href="/touch.png"><link rel="icon" sizes="32x32" href="/small.png"><link rel="icon" type="image/svg+xml" href="/brand.svg">');
    });
    const service = new MetadataService(request);
    service.ensure('https://t.me/private-channel/123?secret=value', false);
    await flush();
    expect(service.icon('https://t.me/')).toMatch(/^data:image\/svg\+xml;/);
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://t.me/', 'https://t.me/brand.svg']);
  });

  it('finds YouTube-style 144px icons after the first three declarations', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('.png') ? response(url, 'image/png') : response(
      '<link rel="shortcut icon" href="/favicon.ico">' + [32, 48, 96, 144].map(size => `<link rel="icon" href="/${size}.png" sizes="${size}x${size}">`).join(''),
    ));
    const service = new MetadataService(request);
    service.ensure('https://youtu.be/video-id', false);
    await flush();
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://youtu.be/', 'https://youtu.be/144.png']);
    expect(service.icon('https://youtu.be/')).toBe(`data:image/png;base64,${btoa('https://youtu.be/144.png')}`);
  });

  it('shares the bare-page request for titles and icons without an ICO race', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('.png') ? response('large', 'image/png') : response('<title>Page title</title><link rel="icon" sizes="144x144" href="/large.png">'));
    const service = new MetadataService(request);
    for (let i = 0; i < 100; i++) service.ensure('https://example.com/page#fragment', true);
    await flush();
    expect(service.title('https://example.com/page')).toBe('Page title');
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/page', 'https://example.com/large.png']);
  });

  it('tries the homepage when the bare page does not declare an icon', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('/page') ? response('<title>Page</title>') : url.endsWith('.png') ? response('large', 'image/png') : response('<link rel="icon" href="/large.png">'));
    const service = new MetadataService(request);
    service.ensure('https://example.com/page', true);
    await flush();
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/page', 'https://example.com/', 'https://example.com/large.png']);
  });

  it('resolves relative icons against the HTML base and rejects private icon URLs', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('.png') ? response('large', 'image/png') : response('<base href="https://cdn.example.com/assets/"><link rel="icon" href="http://127.0.0.1/icon.svg"><link rel="icon" href="file:///icon.svg"><link rel="icon" href="https://user:password@example.com/icon.svg"><link rel="icon" href=""><link rel="icon" href="large.png" sizes="144x144">'));
    const service = new MetadataService(request);
    service.ensure('https://example.com/private', false);
    await flush();
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/', 'https://cdn.example.com/assets/large.png']);
  });

  it('bounds and deduplicates ranked candidates before using the ICO fallback', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('/')) return response([144, 144, 96, 48, 32].map(size => `<link rel="icon" sizes="${size}x${size}" href="/${size}.png">`).join(''));
      return url.endsWith('.ico') ? response('fallback', 'image/x-icon') : response('', 'text/plain', 404);
    });
    const service = new MetadataService(request);
    service.ensure('https://example.com/', false);
    await flush();
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/', 'https://example.com/144.png', 'https://example.com/96.png', 'https://example.com/48.png', 'https://example.com/favicon.ico']);
    expect(service.icon('https://example.com/')).toMatch(/^data:image\/x-icon;/);
  });

  it('rejects oversized images and HTML masquerading as a declared icon', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('/')) return response('<link rel="icon" sizes="512x512" href="/huge.png"><link rel="icon" sizes="256x256" href="/error.png"><link rel="icon" sizes="144x144" href="/good.png">');
      if (url.endsWith('/huge.png')) return response('x'.repeat(128 * 1024 + 1), 'image/png');
      if (url.endsWith('/error.png')) return response('<title>Error</title>');
      return response('good', 'image/png');
    });
    const service = new MetadataService(request);
    service.ensure('https://example.com/', false);
    await flush();
    expect(service.icon('https://example.com/')).toBe(`data:image/png;base64,${btoa('good')}`);
  });

  it('rejects oversized HTML but retains the origin fallback', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('.ico') ? response('fallback', 'image/x-icon') : response('<link rel="icon" href="/large.png">' + ' '.repeat(1024 * 1024)));
    const service = new MetadataService(request);
    service.ensure('https://example.com/', false);
    await flush();
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/', 'https://example.com/favicon.ico']);
  });

  it('keeps the old icon visible during one lazy upgrade and persists the new result', async () => {
    let finish!: (value: WebResponse) => void;
    const request = vi.fn((url: string) => url.endsWith('.png') ? Promise.resolve(response('large', 'image/png')) : new Promise<WebResponse>(resolve => { finish = resolve; }));
    const title = { key: 'title:https://example.com/page', title: 'Saved', expires: Date.now() + 100_000 };
    const service = new MetadataService(request, [legacy(), title]);
    for (let i = 0; i < 10; i++) service.ensure('https://example.com/page', false);
    await flush();
    expect(service.icon('https://example.com/')).toBe(oldIcon);
    expect(request).toHaveBeenCalledTimes(1);
    finish(response('<link rel="icon" sizes="144x144" href="/large.png">'));
    await flush();
    expect(service.icon('https://example.com/')).toBe(`data:image/png;base64,${btoa('large')}`);
    expect(service.title('https://example.com/page')).toBe('Saved');
    const restored = new MetadataService(request, service.snapshot());
    restored.ensure('https://example.com/page', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('keeps legacy icons offline and after failed refreshes, with a bounded retry', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => response('', 'text/plain', 503));
    const service = new MetadataService(request, [legacy()]);
    service.setEnabled(false);
    service.ensure('https://example.com/', false);
    expect(request).not.toHaveBeenCalled();
    expect(service.icon('https://example.com/')).toBe(oldIcon);
    service.setEnabled(true);
    service.ensure('https://example.com/', false);
    await flush();
    expect(service.icon('https://example.com/')).toBe(oldIcon);
    const restored = new MetadataService(request, service.snapshot());
    restored.ensure('https://example.com/', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    restored.ensure('https://example.com/', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(4);
    expect(restored.icon('https://example.com/')).toBe(oldIcon);
  });

  it('retries discovery after a temporary homepage failure even when the old ICO still works', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (url: string) => url.endsWith('.ico') ? response('small', 'image/x-icon') : response('', 'text/plain', 503));
    const service = new MetadataService(request, [legacy()]);
    service.ensure('https://example.com/', false);
    await flush();
    service.ensure('https://example.com/', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(service.icon('https://example.com/')).toMatch(/^data:image\/x-icon;/);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    request.mockImplementation(async url => url.endsWith('.png') ? response('large', 'image/png') : response('<link rel="icon" sizes="144x144" href="/large.png">'));
    service.ensure('https://example.com/', false);
    await flush();
    expect(service.icon('https://example.com/')).toBe(`data:image/png;base64,${btoa('large')}`);
  });

  it.each(['disable', 'clear', 'dispose'])('discards a late icon upgrade after %s', async action => {
    let finish!: (value: WebResponse) => void;
    const service = new MetadataService(async url => url.endsWith('.png') ? new Promise<WebResponse>(resolve => { finish = resolve; }) : response('<link rel="icon" href="/large.png">'), [legacy()]);
    service.ensure('https://example.com/', false);
    await flush();
    if (action === 'disable') service.setEnabled(false);
    else if (action === 'clear') service.clear();
    else service.dispose();
    finish(response('large', 'image/png'));
    await flush();
    expect(service.icon('https://example.com/')).toBe(action === 'clear' ? undefined : oldIcon);
  });
});

describe('favicon themes', () => {
  it('stores both official GitHub SVG variants and selects them without new requests', async () => {
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('.svg')) return response(url.endsWith('-dark.svg') ? '<svg fill="white"/>' : '<svg fill="#24292E"/>', 'image/svg+xml');
      return response('<link rel="icon" type="image/svg+xml" href="https://github.githubassets.com/favicons/favicon.svg">');
    });
    const service = new MetadataService(request, [{ key: 'icon:https://github.com', icon: 'data:image/svg+xml;base64,b2xk', iconVersion: 1, expires: Date.now() + 100_000 }]);
    service.ensure('https://github.com/example/private-repo', false);
    await flush();
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://github.com/', 'https://github.githubassets.com/favicons/favicon.svg', 'https://github.githubassets.com/favicons/favicon-dark.svg']);
    expect(atob(service.icon('https://github.com/', 'dark')!.split(',')[1]!)).toContain('white');
    expect(atob(service.icon('https://github.com/', 'light')!.split(',')[1]!)).toContain('#24292E');
    const offline = new MetadataService(request, service.snapshot());
    offline.setEnabled(false);
    for (const theme of ['dark', 'light', 'dark'] as const) expect(offline.icon('https://github.com/', theme)).toBe(service.icon('https://github.com/', theme));
    offline.setEnabled(true);
    offline.ensure('https://github.com/', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('evaluates website color-scheme media against each app theme instead of the OS scheme', async () => {
    const queries: string[] = [];
    vi.stubGlobal('matchMedia', (query: string) => {
      queries.push(query);
      return { matches: query === '(min-width: 0px)' || query === 'screen and (min-width: 0px)' };
    });
    const request = vi.fn(async (url: string) => url.endsWith('.png') ? response(url, 'image/png') : response('<link rel="icon" href="/common.svg" type="image/svg+xml"><link rel="icon" href="/light.png" sizes="64x64" media="(prefers-color-scheme: light)"><link rel="icon" href="/dark.png" sizes="64x64" media="screen and (prefers-color-scheme: dark)"><link rel="icon" href="/print.svg" media="print">'));
    const service = new MetadataService(request);
    service.ensure('https://example.com/', false);
    await flush();
    expect(atob(service.icon('https://example.com/', 'light')!.split(',')[1]!)).toBe('https://example.com/light.png');
    expect(atob(service.icon('https://example.com/', 'dark')!.split(',')[1]!)).toBe('https://example.com/dark.png');
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/', 'https://example.com/light.png', 'https://example.com/dark.png']);
    expect(queries.some(query => query.includes('prefers-color-scheme'))).toBe(false);
  });

  it('retries a temporarily missing dark variant instead of caching the light fallback for a week', async () => {
    vi.useFakeTimers();
    let available = false;
    const request = vi.fn(async (url: string) => {
      if (url.endsWith('-dark.svg')) return available ? response('white', 'image/svg+xml') : response('', 'text/plain', 503);
      if (url.endsWith('.svg')) return response('black', 'image/svg+xml');
      return response('<link rel="icon" href="https://github.githubassets.com/favicons/favicon.svg">');
    });
    const service = new MetadataService(request);
    service.ensure('https://github.com/', false);
    await flush();
    expect(service.icon('https://github.com/', 'dark')).toBe(service.icon('https://github.com/', 'light'));
    service.ensure('https://github.com/', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(3);
    available = true;
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    service.ensure('https://github.com/', false);
    await flush();
    expect(atob(service.icon('https://github.com/', 'dark')!.split(',')[1]!)).toBe('white');
  });

  it('does not guess GitHub variant URLs for unrelated sites', async () => {
    const request = vi.fn(async (url: string) => url.endsWith('.svg') ? response('brand', 'image/svg+xml') : response('<link rel="icon" href="https://example.com/favicons/favicon.svg">'));
    const service = new MetadataService(request);
    service.ensure('https://example.com/', false);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(service.icon('https://example.com/', 'dark')).toBe(service.icon('https://example.com/', 'light'));
    expect(service.snapshot()[0]?.iconDark).toBeUndefined();
  });

  it('rejects invalid saved dark icon URLs', () => {
    const service = new MetadataService(vi.fn(), [{ key: 'icon:https://example.com', icon: 'data:image/png;base64,b2s=', iconDark: 'https://tracker.example/image', expires: Date.now() + 10_000 }]);
    expect(service.snapshot()).toEqual([]);
  });
});
