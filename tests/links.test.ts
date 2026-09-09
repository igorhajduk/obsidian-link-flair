import { describe, expect, it } from 'vitest';
import { classifyLink, markdownLink, publicWebUrl, readBracketLink, trimBareUrl } from '../src/links';

describe('app destinations', () => {
  it.each([
    ['codex://threads/12345678-abcd-4321-1234-123456789abc', 'Codex'],
    ['chatgpt-conversation://12345678-abcd-4321-1234-123456789abc', 'ChatGPT'],
    ['anybox://item/abc?title=Example%20bookmark', 'Anybox'],
    ['obsidian://open?vault=My%20Vault&file=A%2FB%23Heading', 'Obsidian'],
    ['mindnode://open?document=abc&name=Research', 'MindNode'],
    ['zed://file/Users/me/project/file.ts:12:3', 'Zed'],
    ['things:///show?id=inbox', 'Things'],
    ['omnifocus:///task/abc?name=Plan%20A', 'OmniFocus'],
    ['x-devonthink-item://ABC-123?page=2', 'DEVONthink'],
    ['drafts://open?uuid=abc', 'Drafts'],
    ['bear://x-callback-url/open-note?id=abc&x-success=obsidian%3A%2F%2Fopen', 'Bear'],
    ['vscode://file/Users/me/Example%20Project/main.ts:12:3', 'Visual Studio Code'],
    ['vscode-insiders://file/tmp/example.ts:2:1', 'Visual Studio Code'],
    ['cursor://anysphere.cursor-deeplink/prompt?text=Do%20not%20execute', 'Cursor'],
    ['hook://file/abc?p=encoded%2Fpath&n=Example', 'Hookmark'],
    ['jetbrains://goland/navigate/reference?project=Example&path=src%2Fmain:12:3', 'GoLand'],
    ['jetbrains://idea/navigate/reference?project=Example&path=src%2Fmain:12:3', 'IntelliJ IDEA'],
    ['jetbrains://pycharm/navigate/reference?project=Example&path=src%2Fmain:12:3', 'PyCharm'],
    ['jetbrains://web-storm/navigate/reference?project=Example&path=src%2Fmain:12:3', 'WebStorm'],
    ['jetbrains://php-storm/navigate/reference?project=Example&path=src%2Fmain:12:3', 'PhpStorm'],
    ['jetbrains://clion/navigate/reference?project=Example&path=src%2Fmain:12:3', 'CLion'],
    ['jetbrains://rd/navigate/reference?project=Example&path=src%2Fmain:12:3', 'Rider'],
    ['jetbrains://dbe/navigate/reference?project=Example&path=src%2Fmain:12:3', 'DataGrip'],
    ['jetbrains://rubymine/navigate/reference?project=Example&path=src%2Fmain:12:3', 'RubyMine'],
    ['things:///add?title=Do%20not%20execute&notes=a%26b&x-success=codex%3A%2F%2F', 'Things'],
  ])('preserves %s exactly without treating it as a website', (href, app) => {
    expect(classifyLink(href)).toMatchObject({ href, app, kind: 'app' });
    expect(publicWebUrl(href)).toBeNull();
  });

  it.each(['jetbrains://gateway/connect#opaque', 'jetbrains://oauth/callback?code=opaque', 'jetbrains://unknown/navigate/reference', 'jetbrains://goland@other/navigate/reference', 'jetbrains://goland:123/navigate/reference', 'jetbrains://constructor/navigate/reference', 'forkapp://open?path=example'])('keeps unrecognized destinations generic: %s', href => {
    expect(classifyLink(href)).toMatchObject({ href, kind: 'app', icon: 'external-link' });
    expect(classifyLink(href)?.app).toBeUndefined();
  });
  it('recognizes the JetBrains IDE host case-insensitively without rewriting the URL', () => {
    expect(classifyLink('JETBRAINS://GoLand/navigate/reference?path=a%2Fb')).toMatchObject({ href: 'JETBRAINS://GoLand/navigate/reference?path=a%2Fb', app: 'GoLand' });
  });

  it('recognizes a scheme case-insensitively without changing it', () => {
    expect(classifyLink('THINGS:///show?id=today')).toMatchObject({ href: 'THINGS:///show?id=today', app: 'Things' });
  });

  it('respects native note targets and aliases separately', () => {
    expect(readBracketLink('[[Folder/Note#^block|Custom label]]')).toMatchObject({ href: 'Folder/Note#^block', label: 'Custom label', internal: true });
    expect(readBracketLink('[A note](Folder/Note%20name.md#Heading)')).toMatchObject({ href: 'Folder/Note%20name.md#Heading', label: 'A note', internal: true });
  });

  it('uses a generic icon for other custom app schemes, preserving the destination', () => {
    expect(classifyLink('other-app://open?id=a%2Fb')).toMatchObject({ kind: 'app', icon: 'external-link', href: 'other-app://open?id=a%2Fb' });
    expect(publicWebUrl('other-app://open?id=a%2Fb')).toBeNull();
  });
  it.each(['javascript:alert(1)', 'javascript://example', 'data:text/html,hello', 'vbscript:foo', 'https://\nexample.com'])('does not enhance %s', href => {
    expect(classifyLink(href)).toBeNull();
  });
});

describe('source fidelity', () => {
  it('reads nested parentheses and preserves query and fragment', () => {
    const href = 'https://example.com/a_(b)?q=one&next=two#part';
    expect(readBracketLink(`[A **bold** and \`code\` label](${href} "Optional title")`)).toMatchObject({ href, label: 'A **bold** and `code` label' });
  });
  it('handles a closing bracket inside inline code', () => {
    expect(readBracketLink('[The `]` character](https://example.com)')).toMatchObject({ label: 'The `]` character', href: 'https://example.com' });
  });
  it('supports angle destinations and escaped brackets', () => {
    expect(readBracketLink('[A \\[label\\]](<things:///show?id=inbox>)')).toMatchObject({ href: 'things:///show?id=inbox', label: 'A \\[label\\]' });
  });
  it('resolves reference links without changing author text', () => {
    const references = new Map([['the docs', 'https://obsidian.md']]);
    expect(readBracketLink('[Read this][THE  DOCS]', 0, references)).toMatchObject({ label: 'Read this', href: 'https://obsidian.md' });
    expect(readBracketLink('[the docs][]', 0, references)).toMatchObject({ label: 'the docs', href: 'https://obsidian.md' });
  });
  it.each(['[missing](https://example.com', '[missing]', '[[missing', '![image](https://example.com)'])('leaves incomplete or image syntax alone: %s', source => {
    const position = source.indexOf('[');
    expect(readBracketLink(source, position)).toBeNull();
  });
  it('copies a portable Markdown destination with exact escaping', () => {
    const href = 'things:///show?id=a%2Fb&x-success=codex%3A%2F%2F#part';
    expect(readBracketLink(markdownLink('A [task] *today*', href))?.href).toBe(href);
  });
  it('trims sentence punctuation without discarding URL parentheses', () => {
    expect(trimBareUrl('https://example.com/a_(b)).')).toBe('https://example.com/a_(b)');
  });
});

describe('automatic request policy', () => {
  it.each(['http://localhost/a', 'http://127.0.0.1/a', 'http://2130706433/a', 'http://[::1]/a', 'http://192.168.1.1/a', 'http://printer.local/a', 'http://service.internal/a', 'https://user:secret@example.com/a'])('does not fetch %s', href => {
    expect(publicWebUrl(href)).toBeNull();
  });
  it('retains the public URL query', () => {
    expect(publicWebUrl('https://example.com/a?q=b#c')?.href).toBe('https://example.com/a?q=b#c');
  });
});
