// Runtime stand-ins for the parts of the Obsidian API used by rendering code.
// The obsidian package ships type declarations only.
import { StateField } from '@codemirror/state';

export const editorLivePreviewField = StateField.define<boolean>({ create: () => true, update: value => value });
export const editorInfoField = StateField.define<{ file?: { path: string } | null } | null>({ create: () => null, update: value => value });

export function setTooltip(): void { /* Tooltips are not under test. */ }

export function setIcon(parent: HTMLElement, icon: string): void {
  const svg = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.dataset.icon = icon;
  parent.append(svg);
}

export class Component {
  load(): void { this.onload(); }
  unload(): void { this.onunload(); }
  onload(): void { /* Subclasses override. */ }
  onunload(): void { /* Subclasses override. */ }
}

export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) { super(); }
}
