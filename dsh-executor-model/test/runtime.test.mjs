import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { createScope } from "@deepseek-ai/dsh-scope";
import { ToolRuntime, defineTool } from "@deepseek-ai/dsh-tools";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { Session } from "@deepseek-ai/dsh-session";
import { agentCarrier, agentEvents, installModelSelection } from "@deepseek-ai/dsh-agent";
import { applyChildComposition, resolveChildAgentOptions, captureDelegatedPolicyOverrides, appendDelegatedPolicyOverrides } from "@deepseek-ai/dsh-subagent";
import { HostConnectionService } from "@deepseek-ai/dsh-client-connection";
import { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import { JsonStorageBackend } from "@deepseek-ai/dsh-storage-json";
import { createExecutorState, executorDomainSpec, parseSelectionRecord } from "../lib/state.js";
import { createExecutorRuntime, EXECUTOR_TOOLS, EXECUTOR_TOOL, EXECUTOR_RUN_OPTION, childLabel, annotateJobLabel, callerTag } from "../lib/runtime.js";
import { createExecutorHandler, apply } from "../lib/index.js";

const SMALL = { provider: "cheap", model: "small", reasoningEffort: "low" };
const OTHER = { provider: "other", model: "tiny" };
const deferred = () => Promise.withResolvers();
const pause = () => new Promise((resolve) => setImmediate(resolve));
const text = (result) => result.content.map((block) => block.text ?? "").join("");
function memoryTable() {
	const records = new Map();
	return { records, get: (id) => records.get(id), put: async (id, value) => { records.set(id, structuredClone(value)); } };
}
function fixtureTool(name, execute = async () => "ok") {
	return defineTool({ name, description: `Fixture ${name}`, parameters: {},
		output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] }, execute });
}

async function fixture(t, { runChild, resolve, limits } = {}) {
	const ctx = new Context();
	new SystemPrompt(ctx, {});
	new ToolRuntime(ctx, {});
	const agents = new Map();
	const scopes = new Set();
	const calls = [];
	const disposed = [];
	const validations = [];
	const jobStarts = [];
	ctx.provide("jobs", { start(spec) { jobStarts.push({ ...spec, label: spec.label }); return "bash-1"; } });
	ctx.provide("agents", { get: (id) => agents.get(id), list: () => [...agents.values()], isOwnedBy: () => false });
	ctx.provide("sandboxPolicy", { overrideOf: () => "workspace-write" });
	ctx.provide("approval", {});
	ctx.provide("llm", { async resolveCallConfig(config, signal) {
		validations.push({ config: { ...config }, signal });
		signal?.throwIfAborted();
		if (resolve) return resolve(config, signal);
		if (config.provider === "bad" || config.model === "bad" || config.reasoningEffort === "bad") throw new Error("private-api-key=SHOULD_NOT_LEAK");
		return { ...config };
	} });
	for (const name of [...EXECUTOR_TOOLS, "subagent", "workflow", "create_goal", "send_message"]) ctx.tools.register(fixtureTool(name));
	function makeAgent(id, meta = {}, options = {}) {
		const session = Session.create(id, undefined, { ...Session.create(id).header, cwd: "/workspace", ...meta });
		const agent = { id, session, options, status: "idle" };
		const scope = createScope(ctx, agent);
		scopes.add(scope);
		agent.ctx = scope.ctx.extend({ agent });
		agent._scope = scope;
		agents.set(id, agent);
		return agent;
	}
	const main = makeAgent("main", {}, { provider: "thinking", model: "big", reasoningEffort: "high", maxTokens: 16384 });
	const sibling = makeAgent("sibling", {}, { provider: "thinking", model: "big" });
	installModelSelection(main.ctx, { current: { provider: "thinking", model: "big", reasoningEffort: "high" }, assembled: undefined });
	const provider = { inheritsParentContext: false, capabilities: { agentOptions: true, depthLimit: true, toolFilter: true, persona: true } };
	ctx.provide("subagents", {
		getProvider: () => provider,
		async start(name, request) {
			calls.push({ name, request });
			request.signal.throwIfAborted();
			const child = makeAgent(`child-${calls.length}`, { origin: "subagent", parentSession: request.parent.id, delegationDepth: 1 }, resolveChildAgentOptions(request.parent, request.agentOptions, 1));
			appendDelegatedPolicyOverrides(child.session, captureDelegatedPolicyOverrides(request.parent));
			applyChildComposition(child.ctx, request.parent, { toolFilter: request.toolFilter, persona: request.persona });
			// Actual Cordis publication and actual scoped ToolRuntime/Prompt layers.
			ctx.emit(agentCarrier(child), "agent/created", { agent: child });
			const result = Promise.resolve().then(() => runChild?.(child, request, ctx) ?? { stopReason: "completed", output: [{ type: "text", text: "Verified requested change." }] });
			return { id: child.id, localAgent: child, result, async dispose() {
				disposed.push(child.id);
				await child._scope.dispose();
				scopes.delete(child._scope);
				agents.delete(child.id);
			} };
		},
	});
	const table = memoryTable();
	const state = createExecutorState(table, ctx.llm);
	const runtime = createExecutorRuntime(ctx, state, { maxRequests: 20, maxTokens: 8192, timeoutMs: 10000, ...limits });
	let nextCall = 0;
	const execute = (agent = main, signal = new AbortController().signal, args = { description: "Edit one file", prompt: "Modify only a.txt, then verify the exact diff." }) => ctx.tools.execute({
		name: EXECUTOR_TOOL, arguments: args, agent, signal, callId: `executor-call-${++nextCall}`,
	});
	t.after(async () => {
		await runtime.close();
		await state.close();
		for (const scope of scopes) await scope.dispose();
		await ctx.fiber.dispose();
	});
	return { ctx, agents, main, sibling, provider, makeAgent, calls, disposed, validations, state, table, runtime, execute, jobStarts };
}

test("strict selection schema rejects incomplete routes and model-controlled configuration", () => {
	for (const value of [{}, { selection: {} }, { selection: { provider: "p" } }, { selection: { ...SMALL, toolFilter: {} } }, { selection: { ...SMALL, model: " " } }, { selection: null, enabled: true }]) {
		assert.throws(() => parseSelectionRecord(value));
	}
	assert.deepEqual(parseSelectionRecord({ selection: null }), { selection: null });
});

test("Off is default, enabling is chat-local, disabling removes the real tool schema", async (t) => {
	const f = await fixture(t);
	assert.equal(f.ctx.tools.get("executor", f.main), undefined);
	assert.equal(f.state.read("new-fork"), null);
	await f.state.set(f.main.id, SMALL);
	assert.ok(f.ctx.tools.get("executor", f.main));
	assert.equal(f.ctx.tools.get("executor", f.sibling), undefined);
	assert.equal(f.ctx.tools.get("executor"), undefined);
	const assembly = await f.ctx.systemPrompt.assemble({ agent: f.main, scope: f.main });
	assert.ok(assembly.contexts.some((part) => part.text.includes("never silently repeat edits")));
	assert.equal(f.ctx.tools.executionMode({ name: "executor", arguments: { description: "a", prompt: "b" }, agent: f.main }).kind, "exclusive");
	await f.state.set(f.main.id, null);
	assert.equal(f.ctx.tools.get("executor", f.main), undefined);
	assert.equal((await f.execute()).isError, true);
	assert.equal(f.calls.length, 0);
});

test("real registry dispatch spawns only chosen route; parent options, log, and model selection are unchanged", async (t) => {
	const f = await fixture(t);
	const before = structuredClone(f.main.options);
	const logBefore = f.main.session.snapshotEvents();
	await f.state.set(f.main.id, SMALL);
	const result = await f.execute();
	assert.equal(result.isError, false, text(result));
	assert.equal(f.calls.length, 1);
	const { name, request } = f.calls[0];
	assert.equal(name, "spawn");
	assert.equal(request.parent, f.main);
	assert.equal(request.agentOptions.provider, "cheap");
	assert.equal(request.agentOptions.model, "small");
	assert.equal(request.agentOptions.reasoningEffort, "low");
	assert.equal(request.label, "Executor · small · Edit one file");
	assert.equal(request.maxDepth, 1);
	assert.deepEqual(request.toolFilter.allow, [...EXECUTOR_TOOLS]);
	assert.ok(request.agentOptions[EXECUTOR_RUN_OPTION]);
	assert.deepEqual(f.main.options, before);
	assert.deepEqual(f.main.session.snapshotEvents(), logBefore);
	const assembly = await f.ctx.systemPrompt.assemble({ agent: f.main, scope: f.main });
	assert.equal(assembly.variables.model, "big");
	assert.deepEqual(f.disposed, ["child-1"]);
});

test("child restrictions plus guard reject own-scope delegation; approved file tool still executes", async (t) => {
	const f = await fixture(t, { async runChild(child, request, ctx) {
		assert.equal(ctx.tools.get("subagent", child), undefined);
		assert.equal(ctx.tools.get("executor", child), undefined);
		let executed = false;
		child.ctx.tools.register(fixtureTool("subagent", async () => { executed = true; return "bad"; }));
		assert.ok(ctx.tools.get("subagent", child), "own-scope exemption is real, so the guard is necessary");
		const denied = await ctx.tools.execute({ name: "subagent", arguments: {}, agent: child, signal: request.signal, callId: "denied-own-tool" });
		assert.equal(denied.isError, true);
		assert.match(text(denied), /Executor capability denied/);
		assert.equal(executed, false);
		const read = await ctx.tools.execute({ name: "read", arguments: {}, agent: child, signal: request.signal, callId: "allowed-file-tool" });
		assert.equal(read.isError, false, text(read));
		const events = child.session.snapshotEvents();
		assert.ok(events.some((event) => event.type === "approval/policy" && event.data.policy === "never"));
		assert.ok(events.some((event) => event.type === "sandbox/mode" && event.data.mode === "workspace-write"));
		return { stopReason: "completed", output: [{ type: "text", text: "Guard verified." }] };
	} });
	await f.state.set(f.main.id, SMALL);
	const result = await f.execute();
	assert.equal(result.isError, false, text(result));
});

test("real prompt/request waterfalls pin first child request and clear same-route inherited high effort", async (t) => {
	const f = await fixture(t, { async runChild(child, request, ctx) {
		assert.equal(child.options.reasoningEffort, undefined);
		const assembly = await ctx.systemPrompt.assemble({ agent: child, scope: child, signal: request.signal });
		assert.equal(assembly.variables.provider, "thinking");
		assert.equal(assembly.variables.model, "big");
		const selected = await agentEvents(ctx, child).waterfall("agent/request", { turn: 1, step: 1, signal: request.signal }, async () => ({ provider: "wrong", model: "wrong", reasoningEffort: "high", maxTokens: 100000 }));
		assert.equal(selected.provider, "thinking");
		assert.equal(selected.model, "big");
		assert.equal(selected.reasoningEffort, undefined);
		assert.equal(selected.maxTokens, 8192);
		return { stopReason: "completed", output: [{ type: "text", text: "First request pinned." }] };
	} });
	await f.state.set(f.main.id, { provider: "thinking", model: "big" });
	const result = await f.execute();
	assert.equal(result.isError, false, text(result));
});

test("busy-chat changes affect subsequent delegations, not an already-accepted task", async (t) => {
	const entered = deferred(), release = deferred();
	const f = await fixture(t, { async resolve(config, signal) {
		if (config.maxTokens && config.model === "small") { entered.resolve(); await release.promise; signal.throwIfAborted(); }
		return { ...config };
	} });
	await f.state.set(f.main.id, SMALL);
	const pending = f.execute();
	await entered.promise;
	await f.state.set(f.main.id, OTHER);
	release.resolve();
	assert.equal((await pending).isError, false);
	assert.equal(f.calls[0].request.agentOptions.model, "small");
	assert.equal((await f.execute()).isError, false);
	assert.equal(f.calls[1].request.agentOptions.model, "tiny");
	await f.state.set(f.main.id, null);
	assert.equal((await f.execute()).isError, true);
});

test("invalid route/effort is rejected without leaking provider errors or committing settings", async (t) => {
	const f = await fixture(t);
	await f.state.set(f.main.id, SMALL);
	for (const route of [{ ...SMALL, provider: "bad" }, { ...SMALL, model: "bad" }, { ...SMALL, reasoningEffort: "bad" }]) {
		await assert.rejects(f.state.set(f.main.id, route), (error) => error.status === 422 && !error.message.includes("SHOULD_NOT_LEAK"));
		assert.deepEqual(f.state.read(f.main.id), SMALL);
	}
	assert.equal(f.calls.length, 0);
});

test("selection writes are ordered across async validation and failed durability leaves state unchanged", async (t) => {
	const entered = deferred(), release = deferred();
	const f = await fixture(t, { async resolve(config) { if (config.model === "small") { entered.resolve(); await release.promise; } return config; } });
	const first = f.state.set(f.main.id, SMALL);
	await entered.promise;
	const second = f.state.set(f.main.id, null);
	release.resolve();
	await Promise.all([first, second]);
	assert.equal(f.state.read(f.main.id), null);
	f.table.put = async () => { throw new Error("disk unavailable"); };
	await assert.rejects(f.state.set(f.main.id, OTHER), /disk unavailable/);
	assert.equal(f.state.read(f.main.id), null);
});

test("preflight cancellation starts no child", async (t) => {
	const entered = deferred(), release = deferred();
	const f = await fixture(t, { async resolve(config, signal) { if (config.maxTokens) { entered.resolve(); await release.promise; signal.throwIfAborted(); } return config; } });
	await f.state.set(f.main.id, SMALL);
	const controller = new AbortController();
	const result = f.execute(f.main, controller.signal);
	await entered.promise;
	controller.abort(new Error("cancelled"));
	release.resolve();
	assert.equal((await result).isError, true);
	assert.equal(f.calls.length, 0);
});

test("parent cancellation reaches child and foreground disposal runs exactly once", async (t) => {
	const entered = deferred();
	const f = await fixture(t, { async runChild(_child, request) {
		entered.resolve(request.signal);
		await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
		return { stopReason: "aborted", output: [{ type: "text", text: "a.txt may be partially changed" }] };
	} });
	await f.state.set(f.main.id, SMALL);
	const controller = new AbortController();
	const result = f.execute(f.main, controller.signal);
	const childSignal = await entered.promise;
	controller.abort(new Error("stop"));
	const settled = await result;
	assert.equal(childSignal.aborted, true);
	assert.equal(settled.isError, true);
	assert.deepEqual(f.disposed, ["child-1"]);
	assert.equal(f.calls.length, 1, "no silent retry");
});

for (const reason of ["error", "max-tokens", "refusal", "unexpected"]) test(`child ${reason} surfaces partial report and is never silently rerun`, async (t) => {
	const f = await fixture(t, { runChild: () => ({ stopReason: reason, output: [{ type: "text", text: "Partial change to a.txt." }] }) });
	await f.state.set(f.main.id, SMALL);
	const result = await f.execute();
	assert.equal(result.isError, true);
	assert.match(text(result), /inspect them before retrying/);
	assert.match(text(result), /Partial change/);
	assert.equal(f.calls.length, 1);
	assert.deepEqual(f.disposed, ["child-1"]);
});

test("unload aborts and drains an active child before removing scopes", async (t) => {
	const entered = deferred();
	const f = await fixture(t, { async runChild(_child, request) {
		entered.resolve();
		await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
		return { stopReason: "aborted", output: [] };
	} });
	await f.state.set(f.main.id, SMALL);
	const result = f.execute();
	await entered.promise;
	await f.runtime.close();
	assert.equal((await result).isError, true);
	assert.deepEqual(f.disposed, ["child-1"]);
	assert.equal(f.ctx.tools.get("executor", f.main), undefined);
});

test("child model-request budget is enforced through actual scoped waterfall", async (t) => {
	const f = await fixture(t, { limits: { maxRequests: 2 }, async runChild(child, request, ctx) {
		await ctx.systemPrompt.assemble({ agent: child, scope: child });
		const step = () => agentEvents(ctx, child).waterfall("agent/request", { turn: 1, step: 1, signal: request.signal }, async () => ({ ...SMALL }));
		await step(); await step();
		await assert.rejects(step(), /request budget/);
		return { stopReason: "error", output: [{ type: "text", text: "Budget exhausted." }] };
	} });
	await f.state.set(f.main.id, SMALL);
	assert.equal((await f.execute()).isError, true);
});

test("real JSON storage domain persists per-chat choice across close/reopen without session events", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "dsh-executor-storage-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	async function open() {
		const backend = new JsonStorageBackend(directory);
		const ctx = { storage: { backend: { get: () => backend } }, emit() {}, logger: { warn() {} } };
		const facility = new DomainFacility(ctx, { backend: "json" });
		const domain = await facility.open(executorDomainSpec);
		const state = createExecutorState(domain.table("selections"), { resolveCallConfig: async (config) => config });
		return { state, async close() { await state.close(); await domain.close(); await backend.close(); } };
	}
	const first = await open();
	await first.state.set("chat-a", SMALL);
	await first.state.set("chat-b", OTHER);
	await first.close();
	const reopened = await open();
	assert.deepEqual(reopened.state.read("chat-a"), SMALL);
	assert.deepEqual(reopened.state.read("chat-b"), OTHER);
	assert.equal(reopened.state.read("chat-a-fork"), null);
	await reopened.state.set("chat-a", null);
	await reopened.close();
	const third = await open();
	assert.equal(third.state.read("chat-a"), null);
	assert.deepEqual(third.state.read("chat-b"), OTHER);
	await third.close();
});

test("HTTP uses actual Connection trust fence/auth; cold GET and top-level-only validated POST", async (t) => {
	const f = await fixture(t);
	new HostConnectionService(f.ctx, [], { isAuthenticated: (request) => request.headers.cookie === "test-auth=valid" });
	let resumes = 0;
	f.makeAgent("child-api", { origin: "subagent", parentSession: "main", delegationDepth: 1 });
	f.ctx.provide("sessionController", {
		async inspect(id) { const agent = f.agents.get(id); if (!agent) throw { code: "session/not-found" }; return { meta: agent.session.header }; },
		async resolveAgent(id) { resumes++; const agent = f.agents.get(id); return agent ? { agent } : { error: { code: "session/not-found" } }; },
	});
	const handler = createExecutorHandler(f.ctx, f.state);
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const call = async (method, sessionId = "main", body, headers = {}) => {
		const response = await fetch(`${origin}/api/executor.model?sessionId=${sessionId}`, {
			method, headers: { origin, cookie: "test-auth=valid", "content-type": "application/json", ...headers },
			...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
		});
		return { status: response.status, body: await response.json() };
	};
	assert.equal((await call("GET", "main", undefined, { cookie: "" })).status, 401);
	assert.equal((await call("GET", "main", undefined, { origin: "http://attacker.invalid" })).status, 403);
	assert.equal((await call("POST", "main", { selection: SMALL }, { "sec-fetch-site": "cross-site" })).status, 403);
	assert.deepEqual(await call("GET"), { status: 200, body: { selection: null } });
	assert.equal(resumes, 0, "GET does not activate the session");
	assert.equal((await call("GET", "unknown")).status, 404);
	assert.equal((await call("GET", "child-api")).status, 403);
	assert.equal((await call("POST", "child-api", { selection: SMALL })).status, 403);
	assert.equal((await call("POST", "main", "not-json")).status, 400);
	assert.equal((await call("POST", "main", { selection: { provider: "cheap" } })).status, 400);
	assert.equal((await call("POST", "main", { selection: SMALL }, { "content-type": "text/plain" })).status, 415);
	assert.equal((await call("POST", "main", "x".repeat(4097))).status, 413);
	const unavailable = await call("POST", "main", { selection: { ...SMALL, model: "bad" } });
	assert.equal(unavailable.status, 422);
	assert.doesNotMatch(JSON.stringify(unavailable), /SHOULD_NOT_LEAK/);
	assert.deepEqual(await call("POST", "main", { selection: SMALL }), { status: 200, body: { selection: SMALL } });
	assert.equal(f.main.options.model, "big");
	assert.deepEqual(await call("GET"), { status: 200, body: { selection: SMALL } });
	assert.equal((await call("POST", "main", { selection: null })).status, 200);
	assert.equal(f.ctx.tools.get("executor", f.main), undefined);
	assert.equal(f.main.session.snapshotEvents().length, 0, "no unknown custom session events");
});

test("agents and jobs views receive Executor · model caller labels", async (t) => {
	assert.equal(callerTag(SMALL), "Executor · small");
	assert.equal(childLabel(SMALL, "Edit one file"), "Executor · small · Edit one file");
	assert.equal(annotateJobLabel(SMALL, "sleep 1"), "Executor · small · sleep 1");
	assert.equal(annotateJobLabel(SMALL, "Executor · small · sleep 1"), "Executor · small · sleep 1");
	const f = await fixture(t, { async runChild(child, request, ctx) {
		ctx.jobs.start({ kind: "bash", label: "sleep 1", owner: child });
		ctx.jobs.start({ kind: "bash", label: "sleep 2", owner: request.parent });
		return { stopReason: "completed", output: [{ type: "text", text: "Verified requested change." }] };
	} });
	await f.state.set(f.main.id, SMALL);
	const result = await f.execute();
	assert.equal(result.isError, false, text(result));
	assert.equal(f.jobStarts[0].label, "Executor · small · sleep 1");
	assert.equal(f.jobStarts[1].label, "sleep 2");
});

test("plugin apply uses official domain and authenticated route, then closes resources", async () => {
	const effects = [];
	const table = memoryTable();
	let closed = false, route, removed = false;
	const ctx = {
		storageDomain: { async open(spec) { assert.equal(spec.name, "executor_model"); return { table: () => table, async close() { closed = true; } }; } },
		llm: { resolveCallConfig: async (config) => config },
		agents: { list: () => [], get: () => undefined },
		on: () => () => {},
		effect: (callback) => { const dispose = callback(); effects.push(dispose); return dispose; },
		webServer: { register(value) { route = value; return () => { removed = true; }; } },
	};
	await apply(ctx);
	assert.equal(route.kind, "exact");
	assert.equal(route.path, "/api/executor.model");
	for (const dispose of effects.reverse()) await dispose();
	assert.equal(removed, true);
	assert.equal(closed, true);
});
