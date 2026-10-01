// Obsidian adds these DOM helpers at runtime; jsdom does not have them.
// Suites that opt into the node environment have no DOM to extend.
if (typeof Document !== 'undefined') {
  Object.defineProperty(Document.prototype, 'win', { configurable: true, get(this: Document) { return this.defaultView; } });
  Object.assign(window, {
    createEl(this: Window, tag: string) { return this.document.createElement(tag); },
    createSpan(this: Window) { return this.document.createElement('span'); },
    createFragment(this: Window) { return this.document.createDocumentFragment(); },
  });
}
