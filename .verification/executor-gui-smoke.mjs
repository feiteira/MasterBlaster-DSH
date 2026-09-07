import { chromium } from './node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:3080';
const launch = new URL((await readFile(`${process.env.DSH_HOME}/web-launch.url`, 'utf8')).trim());
const browser = await chromium.launch({ headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const login = await context.request.get(`${origin}/?token=${encodeURIComponent(launch.searchParams.get('token'))}`, { maxRedirects: 0 });
  assert.ok([302,303].includes(login.status()), 'authenticated existing GUI');
  const rpc = async (method, args = {}) => {
    const response = await context.request.post(`${origin}/api/${method}`, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } } });
    const body = await response.json();
    assert.equal(body.result?.ok, true, `${method}: ${JSON.stringify(body.result?.error)}`);
    return body.result.value;
  };
  const catalog = await rpc('session/modelCatalog');
  const chosenGroup = catalog.groups.find(group => group.id === 'openai-codex');
  const chosenModel = chosenGroup?.models.find(model => model.id === 'gpt-5.4-mini');
  assert.ok(chosenModel, 'test executor exists in configured catalog');
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.locator('[data-executor-model]').first().waitFor({ timeout: 20000 });
  await page.getByText('Optional Per-Chat Thinker').first().click();
  await page.locator('[data-executor-caller="Main"]').first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /New Session/i }).first().click();
  await page.locator('[data-executor-model]').first().waitFor({ timeout: 20000 });
  const control = page.locator('[data-executor-model]').first();
  const sessionId = await control.getAttribute('data-executor-model');
  const endpoint = `${origin}/api/executor.model?sessionId=${encodeURIComponent(sessionId)}`;
  const get = async () => {
    const response = await context.request.get(endpoint);
    assert.equal(response.status(), 200);
    return response.json();
  };
  const before = await get();
  assert.equal(before.selection, null, 'new chat defaults Off');
  await page.getByRole('combobox', { name: 'Executor model', exact: true }).selectOption(JSON.stringify([chosenGroup.id, chosenModel.id]));
  await page.waitForFunction(() => document.querySelector('select[aria-label="Executor reasoning effort"]')?.value === 'off');
  assert.deepEqual((await get()).selection, { provider: chosenGroup.id, model: chosenModel.id, reasoningEffort: 'off' });
  assert.deepEqual((await rpc('session/modelCatalog')).default, catalog.default, 'global Main default unchanged');
  await page.screenshot({ path: '.verification/executor-desktop.png', fullPage: true });
  await page.reload();
  await page.locator('[data-executor-model]').first().waitFor();
  // UI can restore a selected chat; API durability is checked for the exact original id independently.
  assert.deepEqual((await get()).selection, { provider: chosenGroup.id, model: chosenModel.id, reasoningEffort: 'off' }, 'selection persists across refresh');
  const unauthorized = await fetch(endpoint);
  assert.equal(unauthorized.status, 401, 'custom endpoint preserves DSH authentication');
  const crossOrigin = await context.request.post(endpoint, { headers: { origin: 'https://untrusted.invalid' }, data: { selection: null } });
  assert.equal(crossOrigin.status(), 403, 'custom endpoint preserves same-origin fence');
  const invalid = await context.request.post(endpoint, { data: { selection: { provider: 'no-such-provider', model: 'no-such-model' } } });
  assert.equal(invalid.status(), 422, 'unknown route rejected');
  assert.deepEqual((await get()).selection, { provider: chosenGroup.id, model: chosenModel.id, reasoningEffort: 'off' }, 'failed selection leaves saved route unchanged');
  const restore = await context.request.post(endpoint, { data: { selection: null } });
  assert.equal(restore.status(), 200);
  assert.equal((await get()).selection, null, 'Off restored');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('[data-executor-model]').first().waitFor();
  await page.screenshot({ path: '.verification/executor-mobile.png', fullPage: true });
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log(JSON.stringify({ url: origin, sessionId, tests: ['Off default','catalog selection','independent lowest effort','global default unchanged','refresh persistence','HTTP auth','CSRF','invalid route','disable'], browserErrors: errors }, null, 2));
} catch (error) {
  if (page) console.error('GUI state:', (await page.locator('body').innerText()).slice(0,4500));
  throw error;
} finally { await browser.close(); }
