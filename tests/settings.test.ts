import { describe, expect, it } from 'vitest';
import { loadSettings, DEFAULT_APPEARANCE, appearanceCSS, defaultAppearance } from '../src/settings';
import { supportedApp } from '../src/apps';
import { classifyLink } from '../src/links';

describe('appearance preferences', () => {
  it('migrates existing settings without changing the current appearance or behavior choices', () => {
    expect(loadSettings({ remoteMetadata: false, showTitles: false, nativeLinks: true })).toEqual({ remoteMetadata: false, showTitles: false, nativeLinks: true, appearance: DEFAULT_APPEARANCE });
  });
  it('restores saved adjustments and keeps theme colors independent from custom choices', () => {
    const settings = loadSettings({ appearance: { themeColors: true, darkColor: '#123456', iconOpacity: 0.7, iconSize: 1.25 } });
    expect(settings.appearance).toMatchObject({ themeColors: true, darkColor: '#123456', iconOpacity: 0.7, iconSize: 1.25 });
    expect(appearanceCSS(settings.appearance)).toContain('--link-flair-color:var(--link-color)');
    settings.appearance.themeColors = false;
    expect(appearanceCSS(settings.appearance)).toContain('--link-flair-color:#123456');
  });
  it('rejects invalid colors and clamps persisted numeric values before creating CSS', () => {
    const settings = loadSettings({ appearance: { darkColor: 'red;}body{display:none}', iconOpacity: 12, iconGap: -5, iconBrightness: NaN } });
    expect(settings.appearance).toMatchObject({ darkColor: DEFAULT_APPEARANCE.darkColor, iconOpacity: 1, iconGap: 0, iconBrightness: 1 });
    expect(appearanceCSS(settings.appearance)).not.toContain('display:none');
  });
  it('keeps separate default objects for different vault settings', () => {
    const one = loadSettings(null), two = loadSettings(null);
    one.appearance.iconSize = 1.5;
    expect(two.appearance.iconSize).toBe(1);
    one.appearance.appIconScales.Codex = 1.5;
    expect(two.appearance.appIconScales).toEqual({});
    expect(defaultAppearance().appIconScales).toEqual({});
    expect(DEFAULT_APPEARANCE.appIconScales).toEqual({});
  });
  it('restores independent app sizes, clamps bounds, and ignores unknown apps and invalid values', () => {
    const settings = loadSettings({ appearance: { iconSize: 1.25, appIconScales: { Codex: 1.5, ChatGPT: 0.75, Anybox: -1, Things: 10, Zed: NaN, MindNode: '2', 'x.com': 0.8, 'evil"]{display:none}': 1 } } });
    expect(settings.appearance.appIconScales).toEqual({ Codex: 1.5, ChatGPT: 0.75, Anybox: 0.5, Things: 2 });
    const css = appearanceCSS(settings.appearance);
    expect(css).toContain('--link-flair-icon-size:1.25em');
    expect(css).toContain('[data-link-flair-app="Codex"]{--link-flair-app-scale:1.5;}');
    expect(css).toContain('[data-link-flair-app="ChatGPT"]{--link-flair-app-scale:0.75;}');
    expect(css).not.toContain('x.com');
    expect(css).not.toContain('display:none');
    expect(loadSettings(JSON.parse(JSON.stringify(settings))).appearance).toEqual(settings.appearance);
  });
  it('shares app identity across Things variants and Obsidian links without changing website icons', () => {
    expect(supportedApp(classifyLink('things://show?id=today')!)).toBe('Things');
    expect(supportedApp(classifyLink('things3://show?id=today')!)).toBe('Things');
    expect(supportedApp(classifyLink('obsidian://open?vault=Example')!)).toBe('Obsidian');
    expect(supportedApp(classifyLink('Related note', true)!)).toBe('Obsidian');
    expect(supportedApp(classifyLink('https://x.com/example')!)).toBeUndefined();
    expect(supportedApp(classifyLink('https://obsidian.md')!)).toBeUndefined();
    expect(supportedApp(classifyLink('other-app://example')!)).toBeUndefined();
  });
});
