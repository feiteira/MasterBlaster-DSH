#!/usr/bin/env node
/**
 * Rewrite installed settings-client bundles on disk so 0.1.2 combo
 * `/plugins/??...` responses include the reverse-proxy host exception.
 *
 * Usage:
 *   node lib/patch-files.js [--dsh /opt/node/lib/node_modules/@deepseek-ai/dsh]
 *                           [--host dev.thehumanloop.eu]
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { SETTINGS_CLIENTS, patchSettingsClient } from "./patch.js";

function arg(flag, fallback) {
	const at = process.argv.indexOf(flag);
	return at === -1 ? fallback : process.argv[at + 1];
}

const dshRoot = arg("--dsh", "/opt/node/lib/node_modules/@deepseek-ai/dsh");
const hosts = (arg("--host", "dev.thehumanloop.eu") ?? "dev.thehumanloop.eu")
	.split(",")
	.map((host) => host.trim())
	.filter(Boolean);

function clientPath(packageName) {
	const fallback = join(dshRoot, "node_modules", packageName, "lib", "client.js");
	try {
		const fromDsh = createRequire(join(dshRoot, "package.json"));
		return join(dirname(fromDsh.resolve(`${packageName}/package.json`)), "lib/client.js");
	} catch {
		return fallback;
	}
}

let patched = 0;
let already = 0;
let missing = 0;
for (const packageName of SETTINGS_CLIENTS) {
	const path = clientPath(packageName);
	let source;
	try {
		source = readFileSync(path, "utf8");
	} catch (error) {
		if (error && error.code === "ENOENT") {
			console.log(`skip missing ${packageName}`);
			missing += 1;
			continue;
		}
		throw error;
	}
	const next = patchSettingsClient(source, hosts, packageName);
	if (next === source) {
		console.log(`already patched ${packageName}`);
		already += 1;
		continue;
	}
	copyFileSync(path, `${path}.pre-remotepatch`);
	writeFileSync(path, next);
	console.log(`patched ${packageName} -> ${path}`);
	patched += 1;
}

if (patched + already === 0) {
	console.error("FAIL: no settings client bundles patched");
	process.exit(1);
}
console.log(`done patched=${patched} already=${already} missing=${missing}`);
