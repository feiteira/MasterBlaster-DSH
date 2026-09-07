# Per-chat Main / Thinker + Executor

An optional DSH Web plugin. It leaves the existing main-model selector and global model defaults alone, and adds **Executor** beside it.

## Use

1. Refresh the existing DSH page after installation.
2. Open a chat. Leave **Executor: Off** for the normal single-model flow.
3. Select an executor from the same configured provider/model catalog used by the main selector. For example, use a small model for routine edits or lookups while keeping GPT-6 Astra as Main.
4. If the model advertises reasoning levels, choose an independent executor **Effort**. A new executor choice starts at the lowest recognized advertised level (including Off where supported).
5. Turn Executor back to **Off** at any time. Already-running work is not replayed or switched mid-run; subsequent delegations use the new setting.

The main model remains responsible for planning, giving the executor a specific task, reviewing its report, and responding to you. The executor gets a fresh, bounded child task, not the whole chat. It can use permitted file/search/Web tools in the same workspace under inherited DSH permissions. It cannot launch further subagents or workflows. Tool calls themselves are still executed by DSH; this is not an extra model call for every `read`, `edit`, or search.

Trajectory, jobs, and agents name the caller: the session header shows **Main · {model}** or **Executor · {model}**, executor tool cards and agent titles use `Executor · {model}`, and background jobs started by the executor are prefixed the same way.

Selections are saved per session in DSH's durable plugin storage. Resuming the same chat preserves its selection; new chats and forks start Off. Opening the selector or refocusing the page refreshes its saved value. This plugin does not change the Main model, its reasoning effort, or defaults for other chats.

## Build and test

Tested against DSH `0.1.2-rc.1`. This deployment has published JS packages, not a full source-monorepo checkout. The plugin is built independently; no replacement Web server is needed.

```sh
npm run build
npm test
```

Build requires `esbuild`. Runtime peer packages must resolve to the **same installed DSH copies**, especially Cordis; do not bundle a second Cordis or React instance. In this deployment, workspace `node_modules` links those peers to the installed DSH packages, and `esbuild` is linked to the verification tool installation.

## Installation

Make this package resolvable from the DSH Web profile's `node_modules` (a symlink to this directory is sufficient). Add this entry to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: executor-model
      name: dsh-executor-model
```

Build `lib/client.js` **before** mounting the plugin. A Web profile with `patchReload: live` can mount the host plugin without a process restart. A browser refresh at the existing DSH URL is required to discover a newly mounted client plugin. Editing source files alone does not update the served bundle. This feature does not require rebuilding the unchanged Web shell.

To remove it, remove its profile patch entry. Saved executor preferences remain in the plugin storage domain but do not affect chats while the plugin is absent. Existing DSH session logs contain no plugin-specific events, so disabling or removing the plugin does not make history unreadable.

## Limits and safety

- Opt-in per top-level chat; executor settings are unavailable on addressed subagent chats.
- A smaller model is not guaranteed to be faster or cheaper for every task. Delegation has its own request overhead, and the Main model chooses when it is appropriate.
- Selecting a catalog model does not guarantee its provider credentials, quota, or model access will work. Errors are surfaced; side-effecting work is never silently replayed on another model.
- Executor tool access is restricted independently of prompt instructions. Existing sandbox, observation, approval, cancellation, and subagent-depth policies still apply.
- Preferences use a dedicated storage domain rather than external session events: this DSH release cannot safely persist arbitrary plugin event types through `Session.append`.
