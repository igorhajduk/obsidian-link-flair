import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.connectOverCDP(process.env.LINK_FLAIR_CDP||'http://127.0.0.1:19223');
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('app://obsidian.md/'));
assert.equal(await page.evaluate(()=>app.vault.adapter.getBasePath()),`${process.cwd()}/work/test-vault`);
const original=await page.evaluate(()=>JSON.parse(JSON.stringify(app.plugins.plugins['link-flair'].settings)));
try {
  await page.evaluate(()=>{app.setting.close();app.plugins.plugins['link-flair'].editCustomIcon('https://intranet.test/issues/123');});
  const modal=page.locator('.link-flair-icon-modal');
  await modal.waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Link',exact:true}).inputValue(),'https://intranet.test/issues/123');
  assert.equal(await page.locator('.link-flair-scope-preview').textContent(),'All links on intranet.test');
  await modal.getByRole('combobox').selectOption('url');
  assert.equal(await page.locator('.link-flair-scope-preview').textContent(),'Only https://intranet.test/issues/123');
  await page.getByRole('textbox',{name:'Icon from',exact:true}).fill('https://www.jetbrains.com/teamcity/download/');
  await page.getByRole('button',{name:'Get icon',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.link-flair-custom-status')?.textContent.startsWith('Ready'),{},{timeout:45000});
  assert(await page.locator('.link-flair-custom-preview').evaluate(img=>img.complete&&img.naturalWidth>0));
  console.log('PASS The actual TeamCity download page imports a decoded favicon for the supplied intranet URL');
  await page.evaluate(()=>document.body.classList.add('is-mobile','is-phone'));
  await page.setViewportSize({width:393,height:852});
  await page.screenshot({path:'work/custom-icon-mobile.png'});
  await page.getByRole('textbox',{name:'Icon from',exact:true}).focus();
  await page.setViewportSize({width:393,height:400});
  await page.waitForFunction(()=>document.querySelector('.link-flair-icon-dialog').style.getPropertyValue('--flair-viewport-height')==='400px');
  await page.waitForFunction(()=>{const e=document.querySelector('input[aria-label="Icon from"]');const b=e.getBoundingClientRect();const c=e.closest('.modal-content').getBoundingClientRect();return b.top>=c.top&&b.bottom<=c.bottom;});
  const layout=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    return {field:rect(document.querySelector('input[aria-label="Icon from"]')),save:rect(document.querySelector('.link-flair-icon-footer button')),modal:rect(document.querySelector('.link-flair-icon-modal')),scrollable:document.querySelector('.link-flair-icon-modal .modal-content').scrollHeight>document.querySelector('.link-flair-icon-modal .modal-content').clientHeight};
  });
  assert(layout.save.bottom<=400&&layout.save.top>=0);
  assert(layout.field.bottom<layout.save.top);
  assert(layout.modal.left>=0&&layout.modal.right<=393);
  assert(layout.scrollable);
  await page.screenshot({path:'work/custom-icon-keyboard-height.png'});
  await page.getByRole('button',{name:'Save icon',exact:true}).click();
  await modal.waitFor({state:'detached'});
  assert(await page.evaluate(()=>app.plugins.plugins['link-flair'].settings.customIcons.some(icon=>icon.url==='https://intranet.test/issues/123')));
  console.log('PASS Exact-URL rule saves; at phone width and 400px available height, the focused URL field and save button remain visible in a scrollable dialog');
} finally {
  await page.keyboard.press('Escape');
  await page.evaluate(async original=>{document.body.classList.remove('is-mobile','is-phone');app.plugins.plugins['link-flair'].settings=original;await app.plugins.plugins['link-flair'].updateSettings();},original);
  const session=await page.context().newCDPSession(page);await session.send('Emulation.clearDeviceMetricsOverride');await session.detach();
  await browser.close();
}
