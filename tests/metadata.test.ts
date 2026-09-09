import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetadataService, metadataHeaders, type WebResponse } from '../src/metadata';

function response(text: string, type = 'text/html', status = 200): WebResponse {
  return { status, headers: { 'content-type': type }, text, arrayBuffer: new TextEncoder().encode(text).buffer };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('metadata lifecycle', () => {
  it('resolves Teams-style icons when the embedded client is rejected by the site', async () => {
    const headers = metadataHeaders('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) obsidian/1.13.7 Chrome/150.0.7871.212 Electron/43.3.0 Safari/537.36');
    expect(headers['User-Agent']).toBe('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.212 Safari/537.36');
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
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://teams.microsoft.com/favicon.ico', 'https://teams.microsoft.com/', 'https://cdn.example.com/teams.ico']);
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
    expect(request).toHaveBeenCalledTimes(2);
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
    expect(request).toHaveBeenCalledTimes(3);
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
    expect(request.mock.calls.map(call => call[0])).toEqual(['https://example.com/favicon.ico', 'https://example.com/', 'https://example.com/brand.png']);
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
