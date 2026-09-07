import { chromium } from './node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3080';
const launch = new URL((await readFile(`${process.env.DSH_HOME}/web-launch.url`, 'utf8')).trim());
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  // Consume the existing local launch credential without printing/persisting it.
  const response = await context.request.get(`${origin}/?token=${encodeURIComponent(launch.searchParams.get('token'))}`, { maxRedirects: 0 });
  if (response.status() !== 303 && response.status() !== 302) throw new Error(`Auth exchange HTTP ${response.status()}`);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: /New Session/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
  console.log(JSON.stringify({ url: page.url(), title: await page.title(), text: (await page.locator('body').innerText()).slice(0,5000), errors }, null, 2));
  console.log('boot keys', await page.evaluate(() => Object.keys(window.__DSH_BOOT__ ?? {})));
  const catalog = await context.request.post(`${origin}/api/session/modelCatalog`, { data: { type: 'client-request', rpcId: 'executor-catalog-inspect', method: 'session/modelCatalog', payload: { args: {} } } });
  console.log('catalog', catalog.status(), (await catalog.text()).slice(0,12000));
  await page.screenshot({ path: '.verification/gui-before.png', fullPage: true });
} finally { await browser.close(); }
