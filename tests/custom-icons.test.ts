import { describe, expect, it, vi } from 'vitest';
import { customIconHost, customIconFor, loadCustomIcons, MAX_CUSTOM_ICON_BYTES } from '../src/custom-icons';
import { loadSettings } from '../src/settings';
import { MetadataService } from '../src/metadata';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

describe('custom site icons', () => {
  it.each([
    ['https://JIRA.Company.com.:8443/issues/123?view=all#top', 'jira.company.com'],
    ['jira.company.com', 'jira.company.com'],
    ['http://intranet/page', 'intranet'],
    ['https://10.0.0.1/page', '10.0.0.1'],
    ['http://[::1]:8080/page', '[::1]'],
    ['https://münchen.de/path', 'xn--mnchen-3ya.de'],
  ])('normalizes a site input: %s', (input, host) => expect(customIconHost(input)).toBe(host));

  it.each(['', 'https://user:secret@site.com/', 'claude://code/new', 'https://', 'bad host', 'javascript:alert(1)'])('rejects invalid site input: %s', input => expect(customIconHost(input)).toBeUndefined());

  it('matches only the exact host while sharing HTTP, HTTPS, ports and paths', () => {
    const icons = [{ host: 'jira.company.com', icon: png }];
    for (const url of ['http://jira.company.com/a', 'https://JIRA.company.com.:8443/b']) expect(customIconFor(url, icons)).toBe(png);
    for (const url of ['https://other.jira.company.com/', 'https://jira.company.com.evil.com/', 'claude://jira.company.com/', 'https://user@jira.company.com/']) expect(customIconFor(url, icons)).toBeUndefined();
  });

  it('loads manual icons without appearance settings and preserves them across serialization', () => {
    const settings = loadSettings({ customIcons: [{ host: 'https://JIRA.company.com/path', icon: png }] });
    expect(settings.customIcons).toEqual([{ host: 'jira.company.com', icon: png }]);
    expect(loadSettings(JSON.parse(JSON.stringify(settings))).customIcons).toEqual(settings.customIcons);
    expect(loadSettings(undefined).customIcons).toEqual([]);
  });

  it('drops hotlinks, non-PNG data, oversized data and malformed records from persisted settings', () => {
    expect(loadCustomIcons([null, { host: 'valid.com', icon: png }, { host: 'other.com', icon: 'https://tracker.com/icon.png' }, { host: 'svg.com', icon: 'data:image/svg+xml;base64,PHN2Zz4=' }, { host: 'huge.com', icon: `data:image/png;base64,${'a'.repeat(MAX_CUSTOM_ICON_BYTES * 2)}` }])).toEqual([{ host: 'valid.com', icon: png }]);
  });

  it('uses internal site icons offline in both themes and keeps them outside the expiring cache', () => {
    const request = vi.fn();
    const service = new MetadataService(request);
    service.setCustomIcons([{ host: 'intranet', icon: png }, { host: '10.0.0.1', icon: png }]);
    service.setEnabled(false);
    service.ensure('https://intranet/private', true);
    service.clear();
    expect(service.icon('https://intranet/private', 'light')).toBe(png);
    expect(service.icon('https://intranet/private', 'dark')).toBe(png);
    expect(service.icon('http://10.0.0.1/page')).toBe(png);
    expect(service.snapshot()).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('overrides cached artwork, skips favicon requests, and restores cached artwork after removal', async () => {
    const request = vi.fn();
    const service = new MetadataService(request, [{ key: 'icon:https://jira.company.com', expires: Date.now() + 10000, icon: 'data:image/png;base64,AAAA' }]);
    const changed = vi.fn();
    service.subscribe(changed);
    service.setCustomIcons([{ host: 'jira.company.com', icon: png }]);
    service.ensure('https://jira.company.com/path', false);
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
    expect(service.icon('https://jira.company.com/path')).toBe(png);
    service.setCustomIcons([]);
    expect(service.icon('https://jira.company.com/path')).toBe('data:image/png;base64,AAAA');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('still fetches requested page titles when an icon is assigned', async () => {
    const request = vi.fn(async () => ({ status: 200, headers: { 'content-type': 'text/html' }, text: '<title>Issue details</title>', arrayBuffer: new ArrayBuffer(30) }));
    const service = new MetadataService(request);
    service.setCustomIcons([{ host: 'jira.company.com', icon: png }]);
    service.ensure('https://jira.company.com/issues/1', true);
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(request.mock.calls).toHaveLength(1);
    expect(service.title('https://jira.company.com/issues/1')).toBe('Issue details');
    expect(service.icon('https://jira.company.com/issues/1')).toBe(png);
  });
});

describe('page-specific rules', () => {
  it('keeps old host rules and makes exact pages win regardless of rule order', () => {
    const rules = loadCustomIcons([{host:'intranet.test',icon:png},{host:'ignored',url:'https://INTRANET.test/issues/123#section',icon:png.replace('iVBOR','iVBOS')}]);
    expect(rules[1]?.host).toBe('intranet.test');
    expect(rules[1]?.url).toBe('https://intranet.test/issues/123');
    expect(customIconFor('https://intranet.test/issues/123#other',rules)).toBe(rules[1]?.icon);
    expect(customIconFor('https://intranet.test/issues/124',rules)).toBe(png);
    expect(customIconFor('https://intranet.test/issues/123?q=1',rules)).toBe(png);
    expect(customIconFor('http://intranet.test/issues/123',rules)).toBe(png);
    expect(loadSettings(JSON.parse(JSON.stringify({customIcons:rules}))).customIcons).toEqual(rules);
  });
  it('does not broaden a malformed exact rule into a site rule', () => {
    expect(loadCustomIcons([{host:'intranet.test',url:'javascript:bad',icon:png}])).toEqual([]);
  });
});
