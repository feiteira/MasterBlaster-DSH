import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import {
	allowlistExpression,
	gateReplacements,
	patchSettingsClient,
} from "../lib/patch.js";

const HOSTS = ["dev.thehumanloop.eu"];
const MARKER = "LOCAL-PATCH(dsh-remote-settings)";

describe("patchSettingsClient", () => {
	it("rewrites the 0.1.1 connection.isLoopback host/memory gates", () => {
		const source = [
			'const controller = new SettingsScopeController(connection.api, spec, this.mirror, connection.isLoopback ? "host" : "memory", this.schema);',
			'const mirror = new SettingsDescribeMirror(connection.api, connection.isLoopback ? "host" : "memory");',
		].join("\n");
		const patched = patchSettingsClient(source, HOSTS, "0.1.1-fixture");
		assert.equal(patched.includes('connection.isLoopback ? "host" : "memory"'), false);
		assert.equal(patched.split(MARKER).length - 1, 2);
		assert.match(patched, /dev\.thehumanloop\.eu/);
	});

	it("rewrites the 0.1.2 $host.isLoopback gates", () => {
		const source = [
			'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";',
			"const documentController = ctx.remote.$host.isLoopback ? new SettingsDocumentStore(ctx, ctx.settingsScope.describe()) : void 0;",
		].join("\n");
		const patched = patchSettingsClient(source, HOSTS, "0.1.2-fixture");
		assert.equal(patched.includes('ctx.remote.$host.isLoopback ? "host" : "memory"'), false);
		assert.equal(patched.includes("ctx.remote.$host.isLoopback ? new SettingsDocumentStore"), false);
		assert.equal(patched.split(MARKER).length - 1, 2);
	});

	it("is idempotent when already marked", () => {
		const source = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";';
		const once = patchSettingsClient(source, HOSTS, "once");
		const twice = patchSettingsClient(once, HOSTS, "twice");
		assert.equal(once, twice);
	});

	it("throws when no known gate is present", () => {
		assert.throws(
			() => patchSettingsClient("export const name = 'nope';", HOSTS, "empty"),
			/no persistence gate/,
		);
	});

	it("patches the staged 0.1.2-rc.1 ui-settings bundles", () => {
		const root = "/var/lib/harness/dsh-patches/.upgrade/prefix/lib/node_modules/@deepseek-ai/dsh/node_modules";
		const settings = `${root}/@deepseek-ai/dsh-client-ui-settings/lib/client.js`;
		const general = `${root}/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`;
		assert.equal(existsSync(settings), true, "staged ui-settings missing — run the upgrade staging install");
		assert.equal(existsSync(general), true, "staged ui-settings-general missing");
		const patchedSettings = patchSettingsClient(readFileSync(settings, "utf8"), HOSTS, "staged-settings");
		const patchedGeneral = patchSettingsClient(readFileSync(general, "utf8"), HOSTS, "staged-general");
		assert.ok(patchedSettings.includes(MARKER));
		assert.ok(patchedGeneral.includes(MARKER));
		assert.equal(patchedSettings.includes('ctx.remote.$host.isLoopback ? "host" : "memory"'), false);
		assert.equal(patchedGeneral.includes("ctx.remote.$host.isLoopback ? new SettingsDocumentStore"), false);
	});

	it("still patches the live 0.1.1 ui-settings bundle when present", () => {
		const live = "/opt/node/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-settings/lib/client.js";
		if (!existsSync(live)) return;
		const source = readFileSync(live, "utf8");
		if (source.includes("ctx.remote.$host.isLoopback")) return;
		const patched = patchSettingsClient(source, HOSTS, "live-0.1.1");
		assert.equal((source.split('connection.isLoopback ? "host" : "memory"').length - 1), 2);
		assert.ok(patched.includes(MARKER));
		assert.equal(patched.includes('connection.isLoopback ? "host" : "memory"'), false);
	});
});

describe("gateReplacements", () => {
	it("scopes the allowlist to configured hosts", () => {
		const expr = allowlistExpression(["dev.thehumanloop.eu", ""]);
		assert.equal(expr, '["dev.thehumanloop.eu"].includes(globalThis.location?.hostname)');
		assert.ok(gateReplacements(["dev.thehumanloop.eu"]).every((gate) => gate.next.includes("dev.thehumanloop.eu")));
	});
});
