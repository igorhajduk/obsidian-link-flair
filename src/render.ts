import { setIcon } from 'obsidian';
import type { LinkTarget } from './links';
import type { MetadataService } from './metadata';
import { appIcon } from './app-icons';
import { supportedApp } from './apps';

export function iconElement(doc: Document, target: LinkTarget, metadata: MetadataService): HTMLElement {
  const icon = doc.createElement('span');
  icon.className = 'link-flair-icon';
  const app = supportedApp(target);
  if (app) icon.dataset.linkFlairApp = app;
  icon.setAttribute('aria-hidden', 'true');
  icon.contentEditable = 'false';
  const data = target.kind === 'web' ? metadata.icon(target.href) : appIcon(target);
  if (data) {
    const image = doc.createElement('img');
    image.src = data;
    image.alt = '';
    image.draggable = false;
    image.decoding = 'async';
    image.addEventListener('error', () => { image.remove(); setIcon(icon, target.icon); }, { once: true });
    icon.append(image);
  } else setIcon(icon, target.icon);
  return icon;
}
