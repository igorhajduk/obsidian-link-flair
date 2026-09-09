/** Keep Reading-view rich copy portable, including selections across sections. */
export function copyWithoutFlair(event: ClipboardEvent, doc: Document): void {
  const selection = doc.getSelection();
  if (!selection?.rangeCount || !event.clipboardData || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const parent = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
  if (!parent || parent.closest('.cm-editor') || !parent.closest('.markdown-preview-view')) return;
  const wrapper = doc.createElement('div');
  wrapper.append(range.cloneContents());
  if (!wrapper.querySelector('.link-flair-icon')) return;
  wrapper.querySelectorAll('.link-flair-icon').forEach(icon => icon.remove());
  wrapper.querySelectorAll<HTMLElement>('[data-link-flair-kind]').forEach(link => {
    delete link.dataset.linkFlairKind;
    delete link.dataset.linkFlairGenerated;
    link.classList.remove('link-flair-link');
  });
  wrapper.querySelectorAll('.link-flair-label').forEach(label => label.replaceWith(...label.childNodes));
  event.preventDefault();
  event.clipboardData.setData('text/plain', selection.toString());
  event.clipboardData.setData('text/html', wrapper.innerHTML);
}
