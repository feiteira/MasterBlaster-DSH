/**
 * dsh-remote-settings — host half.
 *
 * Upstream DSH keeps settings persistence loopback-only on the *browser* side
 * (`$host.isLoopback ? "host" : "memory"`, previously `connection.isLoopback`).
 * This deployment fronts the GUI with TLS + HTTP basic auth on a single
 * hostname and rewrites Host/Origin to loopback, so the *server* fence already
 * accepts privileged settings calls. Without a client-side exception,
 * Settings → Models stays stuck on "settings are unavailable in this browser".
 *
 * This plugin does not weaken the server fence, does not flip `isLoopback`
 * (native desktop actions stay local), and does not enable settings for an
 * arbitrary remote. It serves patched settings-client bundles that use host
 * persistence only on loopback or an allowlisted authenticated hostname.
 *
 * On 0.1.2+, it also writes the process launch-token URL (needed once per
 * browser until the signed cookie exists) to `$DSH_HOME/web-launch.url`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import z from "@deepseek-ai/schemastery";
import { SETTINGS_CLIENTS, patchSettingsClient } from "./patch.js";

export { MARKER, SETTINGS_CLIENTS, allowlistExpression, gateReplacements, patchSettingsClient } from "./patch.js";

/** Stable Cordis plugin name. */
export const name = "remote-settings";

/** Route registration needs the web server. */
export const inject = ["webServer"];

export const Config = z.object({
	/** Hostnames that already passed the reverse-proxy login. */
	hosts: z.array(String).default(["dev.thehumanloop.eu"]),
	/** Public origin used to mint the one-time launch URL. */
	publicOrigin: z.string().default("https://dev.thehumanloop.eu")
});

const DSH_PACKAGE = "/opt/node/lib/node_modules/@deepseek-ai/dsh/package.json";

/**
 * Resolve an installed ui-settings client bundle.
 * @param {string} packageName
 * @returns {string | undefined} absolute path of `lib/client.js`.
 */
export function upstreamClientPath(packageName) {
	const fallback = `/opt/node/lib/node_modules/@deepseek-ai/dsh/node_modules/${packageName}/lib/client.js`;
	try {
		const fromDsh = createRequire(DSH_PACKAGE);
		return join(dirname(fromDsh.resolve(`${packageName}/package.json`)), "lib/client.js");
	} catch {
		if (existsSync(fallback)) return fallback;
		return undefined;
	}
}

function dshHome() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/**
 * Persist the one-time launch URL for reverse-proxy operators. The token is a
 * credential — the file is 0600 and must not be logged.
 * @param {string} url
 * @param {string} [dest]
 */
export function writeLaunchUrl(url, dest = join(dshHome(), "web-launch.url")) {
	mkdirSync(dirname(dest), { recursive: true });
	writeFileSync(dest, `${url}\n`, { encoding: "utf8", mode: 0o600 });
	return dest;
}

/**
 * Mount exact `/plugins/.../client.js` routes that win over `/plugins` and
 * serve the patched bundles. Optionally record the 0.1.2 launch-token URL.
 * @param {object} ctx - host plugin context.
 * @param {object} config - resolved plugin config.
 */
export function apply(ctx, config) {
	const hosts = config?.hosts ?? ["dev.thehumanloop.eu"];
	let served = 0;
	for (const packageName of SETTINGS_CLIENTS) {
		const path = upstreamClientPath(packageName);
		if (path === undefined) continue;
		let body;
		try {
			body = patchSettingsClient(readFileSync(path, "utf8"), hosts, packageName);
		} catch (error) {
			ctx.logger.warn(error instanceof Error ? error : new Error(String(error)));
			continue;
		}
		const routePath = `/plugins/${packageName}/client.js`;
		ctx.effect(() => ctx.webServer.register({
			kind: "exact",
			path: routePath,
			handler: async (req, res) => {
				if (req.method !== "GET" && req.method !== "HEAD") {
					res.writeHead(405);
					res.end();
					return;
				}
				res.writeHead(200, {
					"content-type": "text/javascript; charset=utf-8",
					"cache-control": "no-cache"
				});
				if (req.method === "HEAD") res.end();
				else res.end(body);
			}
		}), `remote-settings: patched ${packageName} client`);
		served += 1;
	}
	if (served === 0) {
		ctx.logger.warn("dsh-remote-settings: no settings client bundles patched");
	}

	const publicOrigin = config?.publicOrigin ?? "https://dev.thehumanloop.eu";
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = connectionCtx.get("connection");
		if (connection === undefined || typeof connection.authenticatedUrl !== "function") return;
		try {
			const dest = writeLaunchUrl(connection.authenticatedUrl(publicOrigin));
			connectionCtx.logger.info(`remote-settings: wrote launch URL to ${dest}`);
		} catch (error) {
			connectionCtx.logger.warn(error instanceof Error ? error : new Error(String(error)));
		}
	});
}
