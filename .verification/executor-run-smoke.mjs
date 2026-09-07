import { chromium } from './node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:3080';
const launch = new URL((await readFile(`${process.env.DSH_HOME}/web-launch.url`, 'utf8')).trim());
const browser = await chromium.launch({ headless: true });
let socket, context, sessionId, timer;
try {
  context = await browser.newContext();
  await context.request.get(`${origin}/?token=${encodeURIComponent(launch.searchParams.get('token'))}`, { maxRedirects: 0 });
  const rpc = async (method, args = {}) => {
    const response = await context.request.post(`${origin}/api/${method}`, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method, payload: { args } } });
    const result = (await response.json()).result;
    assert.equal(result.ok, true, `${method}: ${JSON.stringify(result.error)}`);
    return result.value;
  };
  ({ sessionId } = await rpc('session/create', { request: { cwd: '/var/lib/harness/dsh-patches/dsh-executor-model' } }));
  await rpc('session/rename', { request: { sessionId, title: 'Executor integration smoke test' } });
  const selected = await context.request.post(`${origin}/api/executor.model?sessionId=${sessionId}`, { data: { selection: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' } } });
  assert.equal(selected.status(), 200);
  const cookies = await context.cookies(origin);
  socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/remote.mux`, { headers: { cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '), origin } });
  const snapshot = Promise.withResolvers();
  const finished = Promise.withResolvers();
  const events = [];
  socket.on('message', raw => {
    const message = JSON.parse(raw.toString());
    if (message.type === 'error') { snapshot.reject(new Error(JSON.stringify(message.error))); finished.reject(new Error(JSON.stringify(message.error))); }
    if (message.type !== 'item') return;
    const frame = message.value;
    if (frame.type === 'snapshot') snapshot.resolve(frame);
    if (frame.type === 'event') {
      events.push(frame.event);
      if (frame.event.type === 'tool/call') console.log('Tool', frame.event.data.name ?? JSON.stringify(frame.event.data).slice(0,120));
      if (frame.event.type === 'turn/end') finished.resolve();
    }
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'open', streamId: 'executor-run-smoke', endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'session', sessionId } } } } }));
  await snapshot.promise;
  timer = setTimeout(() => finished.reject(new Error('Live executor test exceeded 180 seconds')), 180000);
  await rpc('session/prompt', { request: { sessionId, requestId: crypto.randomUUID(), mode: 'queue', content: [{ type: 'text', text: 'Integration smoke test: call the executor tool exactly once, asking it to read the first three lines of README.md in this workspace and report its heading. Read-only: do not modify files, run commands, use the internet, or delegate further. After its result, reply with that heading and the executor model used. No other work.' }] } });
  await finished.promise;
  const calls = events.filter(event => event.type === 'tool/call');
  const results = events.filter(event => event.type === 'tool/result');
  console.log(JSON.stringify({ sessionId, calls: calls.map(e => e.data), results: results.map(e => e.data), end: events.find(e => e.type === 'turn/end')?.data }, null, 2));
  await writeFile('.verification/executor-run-events.json', JSON.stringify({ sessionId, events }, null, 2));
  assert.ok(calls.some(event => JSON.stringify(event.data).includes('executor')), 'main called executor');
  const resultText = JSON.stringify(results);
  assert.ok(resultText.includes('deepseek-v4-flash') && /Per-chat Main|Thinker \+ Executor/.test(resultText), 'executor returned heading on selected smaller model');
} finally {
  clearTimeout(timer);
  socket?.close();
  if (sessionId && context) {
    await context.request.post(`${origin}/api/executor.model?sessionId=${sessionId}`, { data: { selection: null } }).catch(() => {});
    await context.request.post(`${origin}/api/session/cancel`, { data: { type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/cancel', payload: { args: { request: { sessionId } } } } }).catch(() => {});
  }
  await browser.close();
}
