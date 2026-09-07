/** Shared rewrite helpers for dsh-remote-settings (no Cordis imports). */

export const MARKER = "LOCAL-PATCH(dsh-remote-settings)";

/**
 * @param {string[]} hosts
 * @returns {string}
 */
export function allowlistExpression(hosts) {
	const allowed = hosts.filter((host) => host.length > 0);
	return `${JSON.stringify(allowed)}.includes(globalThis.location?.hostname)`;
}

/**
 * Known client-side loopback gates, oldest first. Each `next` builder must
 * keep the original true-branch so loopback desktop use is unchanged.
 * @param {string[]} hosts
 */
export function gateReplacements(hosts) {
	const allow = allowlistExpression(hosts);
	return [
		{
			id: "ui-settings-0.1.1-connection-host-memory",
			old: 'connection.isLoopback ? "host" : "memory"',
			next: `(connection.isLoopback || ${allow}) ? "host" : "memory"`
		},
		{
			id: "ui-settings-0.1.2-host-facts-host-memory",
			old: 'ctx.remote.$host.isLoopback ? "host" : "memory"',
			next: `(ctx.remote.$host.isLoopback || ${allow}) ? "host" : "memory"`
		},
		{
			id: "ui-settings-general-0.1.2-document-store",
			old: "ctx.remote.$host.isLoopback ? new SettingsDocumentStore",
			next: `(ctx.remote.$host.isLoopback || ${allow}) ? new SettingsDocumentStore`
		}
	];
}

/**
 * Rewrite known settings persistence gates to also accept allowlisted hosts.
 * @param {string} source - upstream client bundle.
 * @param {string[]} hosts - authenticated reverse-proxy hostnames.
 * @param {string} label - package name, for errors.
 * @returns {string} patched source, or the original when already marked.
 */
export function patchSettingsClient(source, hosts, label = "client") {
	if (source.includes(MARKER)) return source;
	const replacements = gateReplacements(hosts);
	let next = source;
	const applied = [];
	for (const gate of replacements) {
		const count = next.split(gate.old).length - 1;
		if (count === 0) continue;
		next = next.split(gate.old).join(`${gate.next} /* ${MARKER} */`);
		applied.push(`${gate.id} x${count}`);
	}
	if (applied.length === 0) {
		throw new Error(`dsh-remote-settings: no persistence gate in ${label} — DSH layout changed`);
	}
	return next;
}

/** Bundles this plugin rewrites and serves under `/plugins/<name>/client.js`. */
export const SETTINGS_CLIENTS = [
	"@deepseek-ai/dsh-client-ui-settings",
	"@deepseek-ai/dsh-client-ui-settings-general"
];
