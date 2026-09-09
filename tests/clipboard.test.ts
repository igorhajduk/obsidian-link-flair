import { afterEach, describe, expect, it } from 'vitest';
import { copyWithoutFlair } from '../src/clipboard';

afterEach(() => { document.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });

describe('reading copy', () => {
  it('removes decorative images across multiple rendered sections', () => {
    document.body.innerHTML = '<div class="markdown-preview-view"><div id="selection"><p><a class="external-link link-flair-link" href="things:///show?id=inbox" data-link-flair-kind="app"><span class="link-flair-icon"><img src="data:image/png;base64,AA=="></span><span class="link-flair-label">Inbox</span></a></p><p>Another section.</p></div></div>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('selection')!);
    document.getSelection()!.addRange(range);
    const data = new Map<string, string>();
    const event = { clipboardData: { setData: (type: string, value: string) => data.set(type, value) }, preventDefault() {} } as unknown as ClipboardEvent;
    copyWithoutFlair(event, document);
    expect(data.get('text/html')).toContain('things:///show?id=inbox');
    expect(data.get('text/html')).not.toContain('link-flair');
    expect(data.get('text/html')).not.toContain('<img');
    expect(data.get('text/plain')).toContain('Another section.');
  });
  it('does not intercept the editor source-copy handler', () => {
    document.body.innerHTML = '<div class="cm-editor"><div id="selection"><span class="link-flair-icon">icon</span>Source text</div></div>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('selection')!);
    document.getSelection()!.addRange(range);
    let changed = false;
    copyWithoutFlair({ clipboardData: { setData: () => { changed = true; } }, preventDefault() {} } as unknown as ClipboardEvent, document);
    expect(changed).toBe(false);
  });
});
