import { chromium } from './node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:3080';
const launch = new URL((await readFile('/var/lib/harness/.dsh/web-launch.url', 'utf8')).trim());
const browser = await chromium.launch({headless:true});
try {
 const context = await browser.newContext({viewport:{width:1440,height:1000}});
 const login = await context.request.get(`${origin}/?token=${encodeURIComponent(launch.searchParams.get('token'))}`,{maxRedirects:0});
 assert.ok([302,303].includes(login.status()));
 const page = await context.newPage(); const errors=[];
 page.on('pageerror', e=>errors.push(e.message));
 page.on('console', m=>{if(m.type()==='error') errors.push(m.text());});
 await page.goto(origin);
 await page.locator('[data-workspace-tabs]').waitFor({timeout:25000});
 await page.getByRole('tab').first().waitFor({timeout:25000});
 console.log('tabs', await page.getByRole('tab').allTextContents());
 assert.equal(await page.locator('.wt-panel').count(),0,'no duplicate drawer');
 assert.equal(await page.locator('[data-slot="sidebar"]').count(),1,'one native sidebar');
 const native = page.locator('[data-slot="sidebar"]');
 // Native shell may auto-collapse; expand at this desktop width when needed.
 const expand = page.getByRole('button',{name:'Expand sidebar',exact:true});
 if(await expand.isVisible()) await expand.click();
 await native.locator('.tw-term-toggle').waitFor();
 assert.ok(await native.locator('[data-slot="sidebar.settings"]').count());
 assert.ok(await native.locator('[data-slot="sidebar.footer.action"]').count());
 const tabs=page.locator('[data-workspace-tabs] [role="tab"]'); const count=await tabs.count();
 const sets=[];
 for(let i=0;i<Math.min(count,3);i++) {
   await tabs.nth(i).click();
   await page.waitForFunction(i=>document.querySelectorAll('[data-workspace-tabs] [role="tab"]')[i]?.getAttribute('aria-selected')==='true',i);
   // Wait for the native selected row to arrive and the icon layer to scan it.
   await page.waitForFunction(()=>!!document.querySelector('[data-slot="sidebar.workspaces"] [role="treeitem"][aria-selected="true"]'));
   const ids=await native.locator('[data-session-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.sessionId));
   sets.push(ids);
   console.log('selected',i,'native rows',ids.length);
 }
 assert.ok(sets[0].length,'native sessions exist');
 assert.ok(!sets[0].some(id=>sets[1]?.includes(id)),'workspace tabs show disjoint native sessions');
 await page.locator('.si-btn').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
 assert.ok(await page.locator('.si-btn').count(),'session-icon plugin still targets native rows');
 await page.locator('.si-btn').first().click({force:true});
 await page.getByRole('dialog',{name:'Choose session icon'}).waitFor();
 await page.keyboard.press('Escape');
 await native.locator('[data-slot="sidebar.settings"] button').first().click();
 await page.getByRole('dialog').first().waitFor();
 await page.keyboard.press('Escape');
 await page.screenshot({path:'.verification/workspace-tabs-desktop.png'});
 await page.reload();
 await page.getByRole('tab').first().waitFor({timeout:25000});
 assert.equal(await page.locator('.wt-panel').count(),0);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'.verification/workspace-tabs-mobile.png'});
 assert.deepEqual(errors,[],'no browser/slot errors');
 console.log('PASS native sidebar, tab filtering, icons picker, settings, refresh, mobile');
} finally {await browser.close();}
