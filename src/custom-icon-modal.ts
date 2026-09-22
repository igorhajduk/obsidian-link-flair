import { Modal, Setting, requestUrl, type App, type ButtonComponent } from 'obsidian';
import { customIconHost, customIconUrl, importIcon, MAX_IMPORT_BYTES, type CustomIcon } from './custom-icons';
import { metadataHeaders } from './metadata';
import { importIconSource } from './custom-icon-source';
import { iconTheme } from './render';

export class CustomIconModal extends Modal {
  private active = false;
  private busy = false;
  private cleanupViewport?: () => void;
  constructor(app: App, private initial: Partial<CustomIcon>, private save: (icon: CustomIcon) => Promise<void>, private suggestedUrl?: string) { super(app); }

  onOpen(): void {
    this.active = true;
    this.setTitle(this.initial.icon ? 'Edit custom icon' : 'Add custom icon');
    this.modalEl.addClass('link-flair-icon-modal');
    this.containerEl.addClass('link-flair-icon-dialog');
    const { contentEl } = this;
    let site = this.initial.url ?? this.suggestedUrl ?? this.initial.host ?? '';
    let exact = !!this.initial.url;
    let selected = this.initial.icon;
    let imageUrl = '';
    let saveButton: ButtonComponent;
    const controls: ButtonComponent[] = [];
    const updateScope = () => {
      const target = exact ? customIconUrl(site) : customIconHost(site);
      scopePreview.textContent = target ? `${exact ? 'Only' : 'All links on'} ${target}` : 'Enter a link to see where this icon will appear.';
      scopePreview.toggleClass('is-invalid', !!site.trim() && !target);
      saveButton?.setDisabled(this.busy || !selected || !target);
    };
    new Setting(contentEl).setName('Link').addText(text => {
      text.setPlaceholder('Website or page URL').setValue(site).onChange(value => { site = value; updateScope(); });
      this.configureUrlInput(text.inputEl, 'Link');
    });
    new Setting(contentEl).setName('Apply to').addDropdown(dropdown => dropdown.addOption('site', 'Entire site').addOption('url', 'Only this URL').setValue(exact ? 'url' : 'site').onChange(value => { exact = value === 'url'; updateScope(); }));
    const scopePreview = contentEl.createEl('p', { cls: 'link-flair-scope-preview', attr: { 'aria-live': 'polite' } });
    const source = new Setting(contentEl).setName('Icon from').setDesc('Paste a website to use its favicon, or a direct image link.');
    source.settingEl.addClass('link-flair-icon-source');
    source.addText(text => {
      text.setPlaceholder('Website or image URL').onChange(value => { imageUrl = value; });
      this.configureUrlInput(text.inputEl, 'Icon from');
      text.inputEl.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); importButton.buttonEl.click(); }
      });
    });
    const feedback = contentEl.createDiv({ cls: 'link-flair-icon-feedback' });
    const preview = feedback.createEl('img', { cls: 'link-flair-custom-preview', attr: { alt: 'Selected icon' } });
    preview.hidden = !selected;
    if (selected) preview.src = selected;
    const status = feedback.createEl('p', { cls: 'link-flair-custom-status', attr: { role: 'status' } });
    status.textContent = selected ? 'Saved icon. Works offline.' : '';
    const choose = async (load: () => Promise<string>) => {
      if (this.busy) return;
      this.busy = true;
      status.textContent = 'Finding an icon…';
      for (const button of controls) button.setDisabled(true);
      updateScope();
      try {
        const icon = await load();
        if (!this.active) return;
        selected = icon;
        preview.src = icon;
        preview.hidden = false;
        status.textContent = 'Ready to save. Works offline.';
      } catch (error) {
        if (this.active) status.textContent = error instanceof Error ? error.message : 'Could not load an icon. Try another URL or choose a file.';
      } finally {
        this.busy = false;
        if (this.active) {
          for (const button of controls) button.setDisabled(false);
          updateScope();
          feedback.scrollIntoView({ block: 'nearest' });
        }
      }
    };
    let importButton: ButtonComponent;
    source.addButton(button => {
      importButton = button;
      controls.push(button);
      button.setButtonText('Get icon').onClick(() => {
        (contentEl.ownerDocument.activeElement as HTMLElement | null)?.blur();
        return choose(() => importIconSource(imageUrl, url => requestUrl({ url, throw: false, headers: metadataHeaders() }), (bytes, type) => importIcon(bytes, type, contentEl.ownerDocument), iconTheme(contentEl.ownerDocument)));
      });
    });
    const input = contentEl.createEl('input', { attr: { type: 'file', accept: '.png,.jpg,.jpeg,.svg,.webp,.gif,.avif,.ico' } });
    input.hidden = true;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void choose(async () => {
        if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose an image smaller than 2 MB.');
        const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', ico: 'image/x-icon' };
        return importIcon(await file.arrayBuffer(), file.type || types[file.name.split('.').at(-1)?.toLowerCase() ?? ''] || '', contentEl.ownerDocument);
      });
      input.value = '';
    });
    new Setting(contentEl).setName('Or use an image file').addButton(button => {
      controls.push(button);
      button.setButtonText('Choose file').onClick(() => input.click());
    });
    const footer = this.modalEl.createDiv({ cls: 'link-flair-icon-footer' });
    new Setting(footer).addButton(button => {
      saveButton = button;
      button.setButtonText('Save icon').setCta().onClick(async () => {
        const host = customIconHost(site);
        const url = exact ? customIconUrl(site) : undefined;
        if (!host || (exact && !url) || !selected || this.busy) return;
        this.busy = true;
        for (const control of controls) control.setDisabled(true);
        updateScope();
        try { await this.save({ host, ...(url ? { url } : {}), icon: selected }); this.close(); }
        catch { status.textContent = 'Could not save the icon. Try again.'; }
        finally {
          this.busy = false;
          if (this.active) { updateScope(); for (const control of controls) control.setDisabled(false); }
        }
      });
    });
    updateScope();
    this.fitVisibleViewport();
  }

  private configureUrlInput(input: HTMLInputElement, label: string): void {
    input.type = 'url';
    input.inputMode = 'url';
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('aria-label', label);
  }

  private fitVisibleViewport(): void {
    const win = this.contentEl.ownerDocument.defaultView!;
    const viewport = win.visualViewport;
    let frame: number | undefined;
    const fit = () => {
      this.containerEl.setCssProps({ '--flair-viewport-height': `${viewport?.height ?? win.innerHeight}px`, '--flair-viewport-top': `${viewport?.offsetTop ?? 0}px` });
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      frame = win.requestAnimationFrame(() => {
        const focused = this.contentEl.ownerDocument.activeElement;
        if (!(focused instanceof win.HTMLElement) || !this.contentEl.contains(focused)) return;
        const bounds = this.contentEl.getBoundingClientRect();
        const rect = focused.getBoundingClientRect();
        if (rect.bottom > bounds.bottom || rect.top < bounds.top) focused.scrollIntoView({ block: 'nearest' });
      });
    };
    viewport?.addEventListener('resize', fit);
    viewport?.addEventListener('scroll', fit);
    win.addEventListener('resize', fit);
    this.contentEl.addEventListener('focusin', fit);
    fit();
    this.cleanupViewport = () => {
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', fit);
      viewport?.removeEventListener('scroll', fit);
      win.removeEventListener('resize', fit);
      this.contentEl.removeEventListener('focusin', fit);
    };
  }

  onClose(): void { this.active = false; this.cleanupViewport?.(); this.contentEl.empty(); }
}
