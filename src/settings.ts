import { SUPPORTED_APPS, type SupportedApp } from './apps';

export interface Appearance {
  themeColors: boolean;
  underlineOnHover: boolean;
  lightColor: string;
  lightHover: string;
  darkColor: string;
  darkHover: string;
  fontWeight: number;
  iconSize: number;
  iconGap: number;
  iconOpacity: number;
  iconBrightness: number;
  iconSaturation: number;
  appIconScales: Partial<Record<SupportedApp, number>>;
}

export const DEFAULT_APPEARANCE: Appearance = {
  themeColors: false, underlineOnHover: false,
  lightColor: '#2864c7', lightHover: '#174a9c',
  darkColor: '#6198ed', darkHover: '#8bb6f7',
  fontWeight: 500, iconSize: 1, iconGap: 3,
  iconOpacity: 1, iconBrightness: 1, iconSaturation: 1,
  appIconScales: {},
};

export const APP_ICON_SCALE_RANGE = [0.5, 2, 0.05] as const;

export function defaultAppearance(): Appearance {
  return { ...DEFAULT_APPEARANCE, appIconScales: {} };
}

export interface Settings {
  remoteMetadata: boolean;
  showTitles: boolean;
  nativeLinks: boolean;
  appearance: Appearance;
}

export const APPEARANCE_RANGES = {
  fontWeight: [400, 700, 100], iconSize: [0.75, 1.75, 0.05], iconGap: [0, 10, 1],
  iconOpacity: [0.2, 1, 0.05], iconBrightness: [0.5, 1.5, 0.05], iconSaturation: [0, 2, 0.05],
} as const;

export function loadSettings(value: unknown): Settings {
  const settings: Settings = { remoteMetadata: true, showTitles: true, nativeLinks: true, appearance: defaultAppearance() };
  if (!value || typeof value !== 'object') return settings;
  const saved = value as Record<string, unknown>;
  for (const key of ['remoteMetadata', 'showTitles', 'nativeLinks'] as const) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
  if (!saved.appearance || typeof saved.appearance !== 'object') return settings;
  const a = saved.appearance as Record<string, unknown>;
  for (const key of ['themeColors', 'underlineOnHover'] as const) {
    if (typeof a[key] === 'boolean') settings.appearance[key] = a[key];
  }
  for (const key of ['lightColor', 'lightHover', 'darkColor', 'darkHover'] as const) {
    if (typeof a[key] === 'string' && /^#[\da-f]{6}$/i.test(a[key])) settings.appearance[key] = a[key];
  }
  for (const key of Object.keys(APPEARANCE_RANGES) as Array<keyof typeof APPEARANCE_RANGES>) {
    const n = a[key];
    if (typeof n === 'number' && Number.isFinite(n)) settings.appearance[key] = Math.min(APPEARANCE_RANGES[key][1], Math.max(APPEARANCE_RANGES[key][0], n));
  }
  if (a.appIconScales && typeof a.appIconScales === 'object') {
    const scales = a.appIconScales as Record<string, unknown>;
    for (const [app] of SUPPORTED_APPS) {
      const scale = scales[app];
      if (typeof scale === 'number' && Number.isFinite(scale)) {
        settings.appearance.appIconScales[app] = Math.min(APP_ICON_SCALE_RANGE[1], Math.max(APP_ICON_SCALE_RANGE[0], scale));
      }
    }
  }
  return settings;
}

export function appearanceCSS(a: Appearance): string {
  const colors = (normal: string, hover: string) => `--link-flair-color:${a.themeColors ? 'var(--link-color)' : normal};--link-flair-color-hover:${a.themeColors ? 'var(--link-color-hover)' : hover};`;
  const appScales = SUPPORTED_APPS.map(([app]) => `.link-flair-icon[data-link-flair-app="${app}"]{--link-flair-app-scale:${a.appIconScales[app] ?? 1};}`).join('');
  return `.theme-light{${colors(a.lightColor, a.lightHover)}}.theme-dark{${colors(a.darkColor, a.darkHover)}}
  body{--link-flair-hover-underline:${a.underlineOnHover ? 'underline' : 'none'};--link-flair-font-weight:${a.fontWeight};--link-flair-icon-size:${a.iconSize}em;--link-flair-gap:${a.iconGap}px;--link-flair-icon-opacity:${a.iconOpacity};--link-flair-icon-brightness:${a.iconBrightness};--link-flair-icon-saturation:${a.iconSaturation};}${appScales}`;
}
