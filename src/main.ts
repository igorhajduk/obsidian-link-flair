import { MarkdownView, Menu, Notice, Plugin, PluginSettingTab, Setting, requestUrl, type Editor, type MarkdownFileInfo, type SettingDefinitionItem, type SettingDefinition } from 'obsidian';
import { linkFlairEditor, refreshFlair, type EditorHost } from './editor';
import { classifyLink, markdownLink, readBracketLink, referenceId, BARE_LINK_PATTERN, trimBareUrl, type LinkTarget, type SourceLink } from './links';
import { MetadataService, metadataHeaders, type CacheEntry } from './metadata';
import { ReadingFlair } from './reading';
import type { EditorView } from '@codemirror/view';
import { copyWithoutFlair } from './clipboard';
import { loadSettings, appearanceCSS, defaultAppearance, APPEARANCE_RANGES, APP_ICON_SCALE_RANGE, type Settings } from './settings';
import { iconElement, iconTheme } from './render';
import { SUPPORTED_APPS, FEATURED_APPS, type SupportedApp } from './apps';

interface SavedData { settings?: Partial<Settings>; cache?: CacheEntry[] }

export default class LinkFlairPlugin extends Plugin implements EditorHost {
  metadata!: MetadataService;
  settings = loadSettings(undefined);
  private reading = new Set<ReadingFlair>();
  private saveTimer?: number;
  private documents = new WeakSet<Document>();
  private appearanceStyles = new Map<Document, HTMLStyleElement>();
  get showTitles(): boolean { return this.settings.showTitles; }
  get nativeLinks(): boolean { return this.settings.nativeLinks; }

  async onload(): Promise<void> {
    const saved = await this.loadData() as SavedData | null;
    this.settings = loadSettings(saved?.settings);
    this.metadata = new MetadataService(async url => requestUrl({ url, throw: false, headers: metadataHeaders() }), Array.isArray(saved?.cache) ? saved.cache : []);
    this.metadata.enabled = this.settings.remoteMetadata;
    this.register(this.metadata.subscribe(() => this.scheduleSave()));
    this.registerMarkdownPostProcessor((element, context) => {
      const child = new ReadingFlair(element, context, this, () => this.reading.delete(child));
      this.reading.add(child);
      context.addChild(child);
    });
    this.registerEditorExtension(linkFlairEditor(this));
    this.registerDocument(document);
    this.app.workspace.iterateAllLeaves(leaf => this.registerDocument(leaf.view.containerEl.ownerDocument));
    this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, win) => this.registerDocument(win.document)));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.refreshEditors()));
    this.addSettingTab(new FlairSettings(this));
    this.addCommand({ id: 'clear-cache', name: 'Clear link metadata cache', callback: () => { this.metadata.clear(); new Notice('Link metadata cache cleared.'); } });
    this.addCommand({ id: 'copy-link', name: 'Copy link destination', editorCallback: (editor, view) => { const link = this.currentLink(editor, view); if (link) void this.copy(link.href); } });
    this.addCommand({ id: 'copy-markdown-link', name: 'Copy Markdown link', editorCallback: (editor, view) => {
      const link = this.currentLink(editor, view);
      if (link) void this.copy(markdownLink(this.displayLabel(link), link.href, link.form === 'markdown'));
    } });
    this.addCommand({ id: 'show-url', name: 'Show link as URL', editorCallback: (editor, view) => {
      const link = this.currentLink(editor, view);
      if (link && !link.internal) this.replaceLink(editor, link, markdownLink(link.href, link.href));
    } });
    this.addCommand({ id: 'use-page-title', name: 'Use page title as link text', editorCallback: (editor, view) => {
      const link = this.currentLink(editor, view);
      if (!link || classifyLink(link.href)?.kind !== 'web') return;
      const title = this.metadata.title(link.href);
      if (title) this.replaceLink(editor, link, markdownLink(title, link.href));
      else {
        this.metadata.ensure(link.href, true);
        new Notice(this.settings.remoteMetadata ? 'Loading the page title. Run this command again when it is available.' : 'Enable remote metadata to load a page title.');
      }
    } });
  }

  references(path: string): ReadonlyMap<string, string> {
    return new Map(this.app.metadataCache.getCache(path)?.referenceLinks?.map(link => [referenceId(link.id), link.link]) ?? []);
  }

  registerDocument(doc: Document): void {
    if (this.documents.has(doc)) return;
    this.documents.add(doc);
    const style = (doc.win as typeof window).createEl('style');
    style.dataset.linkFlairAppearance = 'true';
    style.textContent = appearanceCSS(this.settings.appearance);
    doc.head.append(style);
    this.appearanceStyles.set(doc, style);
    let theme = iconTheme(doc);
    const observer = new MutationObserver(() => {
      const next = iconTheme(doc);
      if (next === theme) return;
      theme = next;
      this.metadata.refreshAppearance();
    });
    observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    this.register(() => observer.disconnect());
    this.registerDomEvent(doc, 'copy', event => copyWithoutFlair(event, doc));
    if (doc.defaultView) this.registerDomEvent(doc.defaultView, 'unload', () => { observer.disconnect(); this.appearanceStyles.delete(doc); });
  }

  updateAppearance(): void {
    for (const style of this.appearanceStyles.values()) style.textContent = appearanceCSS(this.settings.appearance);
    this.scheduleSave();
  }

  open(target: LinkTarget, sourcePath: string, newLeaf: boolean): void {
    if (target.kind === 'internal') void this.app.workspace.openLinkText(target.href, sourcePath, newLeaf);
    else window.open(target.href, '_blank', 'noopener,noreferrer');
  }

  contextMenu(event: MouseEvent, target: LinkTarget, label: string): void {
    event.preventDefault();
    const menu = new Menu();
    menu.addItem(item => item.setTitle('Open link').setIcon('external-link').onClick(() => this.open(target, '', false)));
    menu.addItem(item => item.setTitle('Copy link').setIcon('copy').onClick(() => this.copy(target.href)));
    menu.addItem(item => item.setTitle('Copy Markdown link').setIcon('link').onClick(() => this.copy(markdownLink(label, target.href))));
    menu.showAtMouseEvent(event);
  }

  private async copy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); }
    catch { new Notice('Could not write to the clipboard.'); }
  }

  private displayLabel(link: SourceLink): string {
    if (link.form !== 'bare') return link.label;
    return this.metadata.title(link.href) ?? classifyLink(link.href)?.fallback ?? link.href;
  }

  private currentLink(editor: Editor, view: MarkdownView | MarkdownFileInfo): SourceLink | undefined {
    const cursor = editor.posToOffset(editor.getCursor());
    const value = editor.getValue();
    const line = editor.getCursor().line;
    const start = editor.posToOffset({ line, ch: 0 });
    const end = start + editor.getLine(line).length;
    const references = this.references(view.file?.path ?? '');
    for (let index = value.indexOf('[', start); index >= start && index <= end; index = value.indexOf('[', index + 1)) {
      const link = readBracketLink(value, index, references);
      if (link && link.from <= cursor && cursor <= link.to) return link;
    }
    for (const match of value.slice(start, end).matchAll(BARE_LINK_PATTERN)) {
      const href = trimBareUrl(match[0]);
      const from = start + match.index;
      const to = from + href.length;
      if (from <= cursor && cursor <= to) return { from, to, labelFrom: from, labelTo: to, href, label: href, form: 'bare', internal: false };
    }
    new Notice('Select a position inside a link first.');
  }

  private replaceLink(editor: Editor, link: SourceLink, replacement: string): void {
    editor.replaceRange(replacement, editor.offsetToPos(link.from), editor.offsetToPos(link.to));
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void this.saveData({ settings: this.settings, cache: this.metadata.snapshot() }); }, 500);
  }

  refreshEditors(): void {
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof MarkdownView) {
        const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
        cm?.dispatch({ effects: refreshFlair.of(null) });
      }
    });
  }

  async updateSettings(): Promise<void> {
    this.metadata.setEnabled(this.settings.remoteMetadata);
    await this.saveData({ settings: this.settings, cache: this.metadata.snapshot() });
    this.refreshEditors();
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
    });
  }

  onunload(): void {
    if (this.saveTimer) void this.saveData({ settings: this.settings, cache: this.metadata.snapshot() });
    window.clearTimeout(this.saveTimer);
    for (const style of this.appearanceStyles.values()) style.remove();
    this.appearanceStyles.clear();
    for (const child of [...this.reading]) child.unload();
    this.metadata?.dispose();
  }
}

class FlairSettings extends PluginSettingTab {
  private selectedApp?: SupportedApp;
  private moreAppsExpanded = false;
  constructor(private plugin: LinkFlairPlugin) { super(plugin.app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    const appearance = this.plugin.settings.appearance;
    const items: SettingDefinition[] = [
      {
        name: 'App icon sizes',
        desc: 'Select an app in the preview to adjust its icon size.',
        aliases: SUPPORTED_APPS.map(([name]) => name),
        render: setting => {
          this.plugin.registerDocument(setting.settingEl.ownerDocument);
          setting.settingEl.empty();
          setting.settingEl.addClass('link-flair-preview-row');
          setting.settingEl.createEl('p', { text: 'Adjust links live in your notes and in the preview below. Select an app to adjust its icon size. Resetting affects appearance only.' });
          this.renderPreview(setting.settingEl);
        },
      },
      {
        name: 'Underline links on hover',
        desc: 'Show a dashed underline when hovering over a link. Hover colors apply either way.',
        render: setting => { setting.addToggle(toggle => toggle.setValue(appearance.underlineOnHover).onChange(value => {
          appearance.underlineOnHover = value;
          this.plugin.updateAppearance();
        })); },
      },
      {
        name: 'Use theme link colors',
        desc: 'Use Obsidian’s current link and hover colors. Turn off to choose your own colors below.',
        render: setting => { setting.addToggle(toggle => toggle.setValue(appearance.themeColors).onChange(value => {
          appearance.themeColors = value;
          this.plugin.updateAppearance();
          this.refreshDomState();
        })); },
      },
    ];
    for (const [key, name] of [['darkColor', 'Link color · dark mode'], ['darkHover', 'Hover color · dark mode'], ['lightColor', 'Link color · light mode'], ['lightHover', 'Hover color · light mode']] as const) {
      items.push({
        name,
        visible: () => !appearance.themeColors,
        render: setting => { setting.addColorPicker(picker => picker.setValue(appearance[key]).onChange(value => {
          appearance[key] = value;
          this.plugin.updateAppearance();
        })); },
      });
    }
    for (const [key, name, desc] of [
      ['fontWeight', 'Text weight', '400 is regular; 700 is bold.'],
      ['iconSize', 'Icon size', 'General size relative to the link text. Individual app sizes are applied on top.'],
      ['iconGap', 'Icon spacing', 'Space between the icon and its label, in pixels.'],
      ['iconOpacity', 'Icon opacity', 'Overrides image dimming from your theme.'],
      ['iconBrightness', 'Icon brightness', '100% keeps the original artwork brightness.'],
      ['iconSaturation', 'Icon saturation', '100% keeps original colors; 0% is grayscale.'],
    ] as const) {
      items.push({ name, desc, render: setting => {
        const format = (value: number) => key === 'fontWeight' ? String(value) : key === 'iconGap' ? `${value}px` : `${Math.round(value * 100)}%`;
        const output = setting.controlEl.createEl('output', { text: format(appearance[key]), cls: 'link-flair-setting-value' });
        const change = (value: number) => {
          appearance[key] = value;
          output.textContent = format(value);
          this.plugin.updateAppearance();
        };
        setting.addSlider(slider => {
          const [min, max, step] = APPEARANCE_RANGES[key];
          slider.setLimits(min, max, step).setValue(appearance[key]).onChange(change);
          slider.sliderEl.addEventListener('input', () => change(slider.getValue()));
        });
      } });
    }
    items.push({
      name: 'Reset appearance',
      desc: 'Restore the current default blue colors, 500 text weight, and original icon size and colors.',
      render: setting => { setting.addButton(button => button.setButtonText('Reset appearance').onClick(() => {
        this.plugin.settings.appearance = defaultAppearance();
        this.plugin.updateAppearance();
        this.update();
      })); },
    });
    const behavior: SettingDefinition[] = [];
    for (const [key, name, desc] of [
      ['remoteMetadata', 'Remote web metadata', 'Load titles and favicons directly from linked websites. Websites receive the requested URL; no Google favicon service is used. App and internal links never need network access.'],
      ['showTitles', 'Titles for bare web URLs', 'Display page titles without changing note contents. Explicit Markdown labels are always preserved.'],
      ['nativeLinks', 'Native note icons', 'Add an icon to internal note links while keeping Obsidian navigation, aliases, and hover previews.'],
    ] as const) {
      behavior.push({ name, desc, render: setting => { setting.addToggle(toggle => toggle.setValue(this.plugin.settings[key]).onChange(async value => {
        this.plugin.settings[key] = value;
        await this.plugin.updateSettings();
      })); } });
    }
    behavior.push({
      name: 'Cached metadata',
      desc: 'Cached titles and icons can be removed at any time. Your notes are unaffected.',
      render: setting => { setting.addButton(button => button.setButtonText('Clear cache').onClick(() => this.plugin.metadata.clear())); },
    });
    return [{ type: 'group', heading: 'Appearance', items }, { type: 'group', heading: 'Link behavior', items: behavior }];
  }

  private renderPreview(container: HTMLElement): void {
    const appearance = this.plugin.settings.appearance;
    const preview = container.createDiv({ cls: 'link-flair-settings-preview' });
    const samples = preview.createDiv();
    const moreApps = preview.createEl('details', { cls: 'link-flair-more-apps' });
    moreApps.open = this.moreAppsExpanded;
    moreApps.createEl('summary', { text: `More apps (${SUPPORTED_APPS.length - FEATURED_APPS.length})` });
    const otherSamples = moreApps.createDiv({ cls: 'link-flair-other-apps' });
    const appSize = preview.createDiv({ cls: 'link-flair-app-size', attr: { id: 'link-flair-app-size' } });
    const appButtons = new Map<SupportedApp, HTMLButtonElement>();
    const showAppSize = () => {
      appSize.empty();
      const app = this.selectedApp;
      appSize.hidden = !app;
      for (const [name, button] of appButtons) button.setAttribute('aria-pressed', String(name === app));
      if (!app) return;
      const setting = new Setting(appSize).setName(`${app} icon size`).setDesc('Relative to the general icon size. 100% uses the general size.');
      const format = (value: number) => `${Math.round(value * 100)}%`;
      const output = setting.controlEl.createEl('output', { cls: 'link-flair-setting-value', text: format(appearance.appIconScales[app] ?? 1) });
      const change = (value: number) => {
        appearance.appIconScales[app] = value;
        output.textContent = format(value);
        this.plugin.updateAppearance();
      };
      setting.addSlider(slider => {
        slider.setLimits(...APP_ICON_SCALE_RANGE).setValue(appearance.appIconScales[app] ?? 1).onChange(change);
        slider.sliderEl.setAttribute('aria-label', `${app} icon size`);
        slider.sliderEl.addEventListener('input', () => change(slider.getValue()));
        setting.addButton(button => button.setButtonText('Reset size').onClick(() => {
          slider.setValue(1);
          change(1);
        }));
      });
    };
    for (const [name, href] of SUPPORTED_APPS) {
      const container = FEATURED_APPS.includes(name) ? samples : otherSamples;
      const button = container.createEl('button', { cls: 'link-flair-link link-flair-preview-app', attr: { type: 'button', 'aria-label': `${name} icon size`, 'aria-controls': 'link-flair-app-size' } });
      button.append(iconElement(preview.ownerDocument, classifyLink(href)!, this.plugin.metadata));
      button.createSpan({ cls: 'link-flair-label', text: name });
      appButtons.set(name, button);
      button.addEventListener('click', () => {
        this.selectedApp = this.selectedApp === name ? undefined : name;
        showAppSize();
      });
    }
    moreApps.addEventListener('toggle', () => {
      this.moreAppsExpanded = moreApps.open;
      if (!moreApps.open && this.selectedApp && !FEATURED_APPS.includes(this.selectedApp)) {
        this.selectedApp = undefined;
        showAppSize();
      }
    });
    const fallback = otherSamples.createSpan({ cls: 'link-flair-link' });
    fallback.append(iconElement(preview.ownerDocument, classifyLink('other-app://preview')!, this.plugin.metadata));
    fallback.createSpan({ cls: 'link-flair-label', text: 'Other app' });
    showAppSize();
  }
}
