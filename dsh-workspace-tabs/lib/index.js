/**
 * dsh-workspace-tabs — host half.
 *
 * Pure UI plugin: the workspace tab bar and the per-workspace session drawer
 * are browser-only surfaces over the existing workspace/session controllers,
 * so the host half has no behavior. The empty apply exists so the plugin
 * appears in the host cordis.yml loader composition (load and lifecycle
 * follow the host; the browser half ships via exports["./client"], discovered
 * through the package.json dsh.client declaration).
 */

/** Stable Cordis plugin name. */
export const name = "workspace-tabs";

/** Host plugin body — no host-side behavior for the workspace tabs plugin. */
export async function apply() {}
