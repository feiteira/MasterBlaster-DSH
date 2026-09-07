// Node harness: import the host plugin with a fake cordis ctx, mount the
// captured upgrade handler on a real node:http server, and drive a real ws
// client through a PTY session.
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import WebSocket from "ws";

const require = createRequire(import.meta.url);
const plugin = await import("../lib/index.js");

let upgradeHandler = null;
const disposers = [];
const fakeCtx = {
  webServer: {
    registerUpgrade({ path, handler }) {
      if (path !== "/terminal.ws") throw new Error(`unexpected path ${path}`);
      upgradeHandler = handler;
      return () => {
        upgradeHandler = null;
      };
    }
  },
  effect(callback, name) {
    const result = callback();
    if (typeof result === "function") disposers.push(result);
    return result;
  }
};

plugin.apply(fakeCtx, { trustedHosts: [], shell: "/bin/bash", maxSessions: 4 });

if (upgradeHandler === null) throw new Error("upgrade route was not registered");

const server = createServer();
server.on("upgrade", (req, socket, head) => {
  if (upgradeHandler !== null) upgradeHandler(req, socket, head);
  else socket.destroy();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

let failures = 0;
function assert(cond, label) {
  if (cond) console.log("  ok  " + label);
  else {
    failures++;
    console.log("FAIL  " + label);
  }
}

// workspace dir
const workdir = mkdtempSync(join(tmpdir(), "dsh-term-test-"));
writeFileSync(join(workdir, "marker.txt"), "present");

// 1. trust fence: reject a cross-site-origin upgrade
{
  const http = require("http");
  const req = http.request({
    host: "127.0.0.1",
    port,
    path: "/terminal.ws",
    headers: {
      Host: "127.0.0.1:" + port,
      Origin: "http://evil.example",
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version": "13"
    }
  });
  const status = await new Promise((resolve) => {
    req.on("response", (res) => resolve(res.statusCode));
    req.on("error", () => resolve(0));
    req.end();
  });
  assert(status === 403, "cross-site Origin upgrade rejected (403)");
}

// 2. happy path: spawn, echo, cwd
{
  const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws?cwd=${encodeURIComponent(workdir)}&cols=120&rows=30`, {
    headers: { Origin: `http://127.0.0.1:${port}` }
  });
  const collected = [];
  const events = [];
  ws.on("message", (raw) => {
    const frame = JSON.parse(String(raw));
    collected.push(frame);
    if (frame.type === "output") events.push(frame.data);
    if (frame.type === "exit") events.push(`exit:${frame.code}`);
  });
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  // wait for the shell prompt to appear
  await new Promise((r) => setTimeout(r, 700));
  ws.send(JSON.stringify({ type: "input", data: "pwd\r" }));
  ws.send(JSON.stringify({ type: "input", data: "echo TERM_OK=$TERM\r" }));
  ws.send(JSON.stringify({ type: "input", data: "test -f marker.txt && echo MARKER_OK\r" }));
  await new Promise((r) => setTimeout(r, 1200));
  const output = events.join("");
  assert(output.includes(workdir), "pwd echoes the requested workspace cwd");
  assert(output.includes("TERM_OK=xterm-256color"), "TERM is xterm-256color");
  assert(output.includes("MARKER_OK"), "commands run inside the workspace dir");
  assert(collected.some((f) => f.type === "output"), "output frames received");
  ws.close();
  await new Promise((r) => setTimeout(r, 400));
}

// 3. resize frame is accepted without error
{
  const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws`, {
    headers: { Origin: `http://127.0.0.1:${port}` }
  });
  let sawExit = false;
  ws.on("message", (raw) => {
    const frame = JSON.parse(String(raw));
    if (frame.type === "exit") sawExit = true;
  });
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  await new Promise((r) => setTimeout(r, 600));
  ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 20 }));
  ws.send(JSON.stringify({ type: "input", data: "echo RESIZE_OK\r" }));
  await new Promise((r) => setTimeout(r, 900));
  assert(sawExit === false, "session alive after resize");
  ws.close();
  await new Promise((r) => setTimeout(r, 400));
}

// 4. bad cwd falls back to server cwd (no crash)
{
  const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws?cwd=/no/such/dir`, {
    headers: { Origin: `http://127.0.0.1:${port}` }
  });
  const events = [];
  ws.on("message", (raw) => {
    const frame = JSON.parse(String(raw));
    if (frame.type === "output") events.push(frame.data);
  });
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  await new Promise((r) => setTimeout(r, 600));
  ws.send(JSON.stringify({ type: "input", data: "echo FALLBACK_OK\r" }));
  await new Promise((r) => setTimeout(r, 900));
  assert(events.join("").includes("FALLBACK_OK"), "invalid cwd falls back gracefully");
  ws.close();
  await new Promise((r) => setTimeout(r, 400));
}

// 5. exit frame on `exit`
{
  const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws`, {
    headers: { Origin: `http://127.0.0.1:${port}` }
  });
  const frames = [];
  ws.on("message", (raw) => frames.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  await new Promise((r) => setTimeout(r, 600));
  ws.send(JSON.stringify({ type: "input", data: "exit\r" }));
  const exitFrame = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    ws.on("close", () => {
      clearTimeout(timer);
      resolve(frames.find((f) => f.type === "exit") ?? null);
    });
  });
  assert(exitFrame !== null, "exit frame delivered with code " + (exitFrame ? exitFrame.code : "?"));
}

// 6. concurrent sessions are isolated
{
  const sockets = [];
  const outputs = [];
  for (let i = 0; i < 3; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws`, {
      headers: { Origin: `http://127.0.0.1:${port}` }
    });
    outputs.push("");
    ws.on("message", (raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.type === "output") outputs[i] += frame.data;
    });
    sockets.push(ws);
  }
  await Promise.all(sockets.map((ws) => new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  })));
  await new Promise((r) => setTimeout(r, 600));
  for (let i = 0; i < 3; i++) {
    sockets[i].send(JSON.stringify({ type: "input", data: `echo SESSION_${i}\r` }));
  }
  await new Promise((r) => setTimeout(r, 1200));
  assert(outputs[0].includes("SESSION_0") && !outputs[0].includes("SESSION_1"), "session 0 isolated");
  assert(outputs[1].includes("SESSION_1") && !outputs[1].includes("SESSION_2"), "session 1 isolated");
  assert(outputs[2].includes("SESSION_2") && !outputs[2].includes("SESSION_0"), "session 2 isolated");
  for (const ws of sockets) ws.close();
  await new Promise((r) => setTimeout(r, 400));
}

// 7. session cap enforced
{
  const sockets = [];
  for (let i = 0; i < 8; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws`, {
      headers: { Origin: `http://127.0.0.1:${port}` }
    });
    sockets.push(ws);
  }
  const opened = await Promise.all(sockets.map((ws) => new Promise((resolve) => {
    let didOpen = false;
    ws.on("open", () => {
      didOpen = true;
      resolve(true);
    });
    ws.on("error", () => resolve(false));
    ws.on("close", () => {
      if (!didOpen) resolve(false);
    });
  })));
  assert(opened.filter(Boolean).length === 4, "exactly 4 of 8 sessions open at the cap");
  const ninth = new WebSocket(`ws://127.0.0.1:${port}/terminal.ws`, {
    headers: { Origin: `http://127.0.0.1:${port}` }
  });
  const ninthAccepted = await new Promise((resolve) => {
    ninth.on("open", () => resolve(true));
    ninth.on("error", () => resolve(false));
  });
  assert(ninthAccepted === false, "9th session refused at the cap");
  for (const ws of sockets) ws.close();
  await new Promise((r) => setTimeout(r, 400));
}

// cleanup
for (const dispose of disposers) dispose();
server.close();
console.log(failures === 0 ? "\nALL HOST TESTS PASSED" : `\n${failures} HOST TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
