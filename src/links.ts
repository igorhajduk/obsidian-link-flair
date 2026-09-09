export type LinkKind = 'web' | 'app' | 'internal';

export interface LinkTarget {
  href: string;
  kind: LinkKind;
  icon: string;
  app?: string;
  fallback: string;
}

const APP_SCHEMES: Record<string, { name: string; icon: string }> = {
  codex: { name: 'Codex', icon: 'square-terminal' },
  'chatgpt-conversation': { name: 'ChatGPT', icon: 'message-circle' },
  anybox: { name: 'Anybox', icon: 'bookmark' },
  obsidian: { name: 'Obsidian', icon: 'gem' },
  mindnode: { name: 'MindNode', icon: 'network' },
  zed: { name: 'Zed', icon: 'square-code' },
  things: { name: 'Things', icon: 'circle-check-big' },
  things3: { name: 'Things', icon: 'circle-check-big' },
  'omnifocus': { name: 'OmniFocus', icon: 'circle-check-big' },
  'x-devonthink-item': { name: 'DEVONthink', icon: 'files' },
  'drafts': { name: 'Drafts', icon: 'file-pen-line' },
  'bear': { name: 'Bear', icon: 'notebook-pen' },
  'vscode': { name: 'Visual Studio Code', icon: 'square-code' },
  'vscode-insiders': { name: 'Visual Studio Code', icon: 'square-code' },
  'cursor': { name: 'Cursor', icon: 'square-code' },
  'hook': { name: 'Hookmark', icon: 'link' },
  mailto: { name: 'Mail', icon: 'mail' },
  tel: { name: 'Phone', icon: 'phone' },
  file: { name: 'File', icon: 'file' },
};

// Toolbox URLs identify the IDE in the host, not in the shared scheme.
const JETBRAINS_IDES: Readonly<Record<string, string>> = {
  'goland': 'GoLand',
  'idea': 'IntelliJ IDEA',
  'pycharm': 'PyCharm',
  'web-storm': 'WebStorm',
  'php-storm': 'PhpStorm',
  'clion': 'CLion',
  'rd': 'Rider',
  'dbe': 'DataGrip',
  'rubymine': 'RubyMine',
};

// eslint-disable-next-line no-control-regex -- Exclude literal control characters from link text.
export const BARE_LINK_PATTERN = /(?:[a-z][a-z\d+.-]*:\/\/|(?:mailto|tel):)[^\s<>`"\u0000-\u001f]+/gi;
const NON_APP_SCHEMES = new Set(['javascript', 'vbscript', 'data', 'blob', 'about', 'chrome', 'chrome-extension', 'devtools', 'resource', 'app']);

export function schemeOf(href: string): string | null {
  return /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1]?.toLowerCase() ?? null;
}

export function decodeText(text: string): string {
  try { return decodeURIComponent(text); }
  catch { return text; }
}

export function classifyLink(href: string, internal = false): LinkTarget | null {
  // eslint-disable-next-line no-control-regex -- Reject control characters before classifying a destination.
  if (!href || /[\u0000-\u001f\u007f]/.test(href)) return null;
  if (internal) return { href, kind: 'internal', icon: 'file-text', fallback: decodeText(href) };
  const scheme = schemeOf(href);
  if (scheme === 'http' || scheme === 'https') {
    try {
      const url = new URL(href);
      if (!url.hostname) return null;
      return { href, kind: 'web', icon: 'globe', fallback: url.hostname.replace(/^www\./, '') };
    } catch { return null; }
  }
  if (!scheme) return null;
  if (scheme === 'jetbrains') {
    try {
      const url = new URL(href);
      if (!url.username && !url.password && !url.port && Object.hasOwn(JETBRAINS_IDES, url.hostname.toLowerCase())) {
        const name = JETBRAINS_IDES[url.hostname.toLowerCase()]!;
        return { href, kind: 'app', app: name, icon: 'square-code', fallback: appLabel(href, scheme, name) };
      }
    } catch { /* Preserve unrecognized custom destinations with the generic fallback below. */ }
  }
  const app = Object.hasOwn(APP_SCHEMES, scheme) ? APP_SCHEMES[scheme] : undefined;
  if (!app) {
    if (NON_APP_SCHEMES.has(scheme) || !href.slice(scheme.length + 1).startsWith('//')) return null;
    return { href, kind: 'app', icon: 'external-link', fallback: appLabel(href, scheme, scheme) };
  }
  return { href, kind: 'app', app: app.name, icon: app.icon, fallback: appLabel(href, scheme, app.name) };
}

function appLabel(href: string, scheme: string, name: string): string {
  if (scheme === 'mailto' || scheme === 'tel') return decodeText(href.slice(scheme.length + 1).split('?')[0] ?? href);
  try {
    const url = new URL(href);
    let detail = url.searchParams.get('title') || url.searchParams.get('name');
    if (scheme === 'obsidian') detail ||= url.searchParams.get('file');
    if (scheme === 'things' || scheme === 'things3') {
      const id = url.searchParams.get('id');
      if (id && /^(inbox|today|anytime|upcoming|someday|logbook|trash)$/i.test(id)) detail ||= id;
    }
    if (scheme === 'zed' || scheme === 'file') detail ||= decodeText(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
    if (scheme === 'codex') {
      const id = url.pathname.split('/').filter(Boolean).at(-1);
      if (id && /^[\da-f-]{16,}$/i.test(id)) detail ||= id.slice(0, 8);
    }
    return detail ? `${name} · ${detail}` : name;
  } catch { return name; }
}

/** Remove sentence punctuation, preserving balanced parentheses in URLs. */
export function trimBareUrl(value: string): string {
  let result = value.replace(/[.,;:!?]+$/, '');
  for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
    const count = (char: string) => [...result].filter(c => c === char).length;
    while (result.endsWith(close) && count(close) > count(open)) result = result.slice(0, -1);
  }
  return result;
}

/** Requests are never derived from app URLs or credential-bearing/local URLs. */
export function publicWebUrl(href: string): URL | null {
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.') || host.startsWith('[') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host)) return null;
    // All literal IP addresses are excluded, including WHATWG-normalized forms.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    return url;
  } catch { return null; }
}

export interface SourceLink {
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
  href: string;
  label: string;
  form: 'markdown' | 'wiki' | 'bare';
  internal: boolean;
}

const unescapeMarkdown = (text: string) => text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
export const referenceId = (text: string) => unescapeMarkdown(text).trim().replace(/\s+/g, ' ').toLowerCase();

/** Parse one link at a syntax-token boundary supplied by Obsidian's parser. */
export function readBracketLink(source: string, from = 0, references: ReadonlyMap<string, string> = new Map()): SourceLink | null {
  if (source[from] !== '[' || source[from - 1] === '!' || source[from - 1] === '\\') return null;
  if (source.startsWith('[[', from)) {
    const end = source.indexOf(']]', from + 2);
    if (end < 0 || source.slice(from, end).includes('\n')) return null;
    const inner = source.slice(from + 2, end);
    const pipe = inner.indexOf('|');
    const href = pipe < 0 ? inner : inner.slice(0, pipe);
    if (!href) return null;
    const labelFrom = pipe < 0 ? from + 2 : from + 3 + pipe;
    return { from, to: end + 2, labelFrom, labelTo: end, href, label: source.slice(labelFrom, end), form: 'wiki', internal: true };
  }
  let depth = 1;
  let end = from + 1;
  for (; end < source.length; end++) {
    const ch = source[end];
    if (ch === '\\') { end++; continue; }
    if (ch === '`') {
      let count = 1;
      while (source[end + count] === '`') count++;
      const close = source.indexOf('`'.repeat(count), end + count);
      if (close >= 0) { end = close + count - 1; continue; }
    }
    if (ch === '[') depth++;
    if (ch === ']') { depth--; if (depth === 0) break; }
    if (end - from > 8192) return null;
  }
  if (depth !== 0) return null;
  const label = source.slice(from + 1, end);
  let href: string | undefined;
  let to = end + 1;
  if (source[to] === '(') {
    let cursor = to + 1;
    while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
    const start = cursor;
    if (source[cursor] === '<') {
      cursor++;
      const finish = source.indexOf('>', cursor);
      if (finish < 0) return null;
      href = source.slice(cursor, finish);
      cursor = finish + 1;
    } else {
      let nesting = 0;
      for (; cursor < source.length; cursor++) {
        const ch = source[cursor];
        if (ch === '\\') { cursor++; continue; }
        if (ch === '(') nesting++;
        else if (ch === ')') { if (nesting === 0) break; nesting--; }
        else if (/\s/.test(ch ?? '')) break;
      }
      href = source.slice(start, cursor);
    }
    while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
    if (source[cursor] === '"' || source[cursor] === "'" || source[cursor] === '(') {
      const close = source[cursor] === '(' ? ')' : source[cursor];
      cursor++;
      while (cursor < source.length && source[cursor] !== close) { if (source[cursor] === '\\') cursor++; cursor++; }
      if (cursor === source.length) return null;
      cursor++;
      while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
    }
    if (source[cursor] !== ')') return null;
    to = cursor + 1;
  } else {
    let id = label;
    if (source[to] === '[') {
      const finish = source.indexOf(']', to + 1);
      if (finish < 0) return null;
      id = source.slice(to + 1, finish) || label;
      to = finish + 1;
    }
    href = references.get(referenceId(id));
  }
  if (href === undefined) return null;
  href = unescapeMarkdown(href);
  return { from, to, labelFrom: from + 1, labelTo: end, href, label, form: 'markdown', internal: schemeOf(href) === null && !href.startsWith('//') };
}

export function markdownLink(label: string, href: string, labelIsMarkdown = false): string {
  const text = labelIsMarkdown ? label : label.replace(/\\/g, '\\\\').replace(/[[\]`*_]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  const destination = href.replace(/\\/g, '\\\\').replace(/[<>\s]/g, c => encodeURIComponent(c));
  return `[${text}](<${destination}>)`;
}
