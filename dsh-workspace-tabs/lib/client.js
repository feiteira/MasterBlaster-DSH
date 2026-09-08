/**
 * dsh-workspace-tabs — browser half (hand-built in the client-modules bundle
 * format: window.__ModuleLoader__.load({ id, factory })). Only platform seed
 * words are required (react).
 *
 * Workspaces ride across the top like browser tabs. The tabs do not render
 * their own session list: instead the plugin shadows the native
 * `sidebar.workspaces` entry with a wrapper that renders the ORIGINAL
 * WorkspaceBrowser component with workspace/session hooks filtered to the
 * selected tab. Session rows, icons, actions, status indicators, search, the
 * brand mark, New Session, footer actions, and Settings all stay native —
 * only the visible account is scoped. An "Ungrouped" tab appears for sessions
 * outside every workspace.
 *
 * Selecting a tab opens that workspace's most-recent session (reusing its
 * blank placeholder, or creating a session when it has none), so the main
 * view follows the tabs. The selection also follows the current session, so
 * navigating through the sidebar keeps the tabs in sync. A leading "+" opens
 * an "Add workspace" dialog (home-directory browse + new folder) that adopts
 * the chosen directory as a new project tab.
 */
window.__ModuleLoader__.load({
	id: "dsh-workspace-tabs",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		const TAB_BAR_PX = 42;
		const SELECTED_KEY = "dsh-workspace-tabs.selected.v1";
		const UNGROUPED_ID = "__wt_ungrouped__";
		const FLAT_SESSION_ORDER_KEY = "__flat_session_order__";
		const SIDEBAR_WORKSPACES_SLOT = "sidebar.workspaces";

		const css = [
			".wt-root{position:fixed;inset:0;pointer-events:none;z-index:900;font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif)}",
			".wt-tabs{pointer-events:auto;position:fixed;top:0;left:0;right:0;height:" + TAB_BAR_PX + "px;box-sizing:border-box;display:flex;align-items:stretch;gap:4px;padding:6px 10px 0;background:var(--dsw-alias-bg-base,#101010);border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}",
			".wt-tablist{flex:1;display:flex;align-items:stretch;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:thin}",
			".wt-tab{flex:none;display:flex;align-items:center;gap:7px;max-width:220px;min-width:0;padding:0 12px;border:1px solid transparent;border-bottom:none;border-radius:9px 9px 0 0;background:transparent;color:var(--dsw-alias-label-secondary,#aaa);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}",
			".wt-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#eee)}",
			".wt-tab.wt-active{background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base,#1a1a1a));border-color:var(--dsw-alias-border-l2,rgba(127,127,127,.35));color:var(--dsw-alias-label-primary,#eee);font-weight:600}",
			".wt-tab:focus-visible{outline:2px solid var(--dsw-alias-label-primary-bluish,#4da3ff);outline-offset:-2px}",
			".wt-tab-name{overflow:hidden;text-overflow:ellipsis}",
			".wt-count{flex:none;min-width:20px;text-align:center;font-size:11px;font-variant-numeric:tabular-nums;padding:1px 5px;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));color:var(--dsw-alias-label-secondary,#aaa)}",
			".wt-tab.wt-active .wt-count{background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.3));color:inherit}",
			".wt-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#3fb950)}",
			".wt-side{display:flex;align-items:center;gap:6px;flex:none;padding-bottom:6px}",
			".wt-status{font-size:11px;color:var(--dsw-alias-label-secondary,#aaa);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".wt-status.wt-error{color:var(--dsw-alias-state-error-primary,#f47067)}",
			".wt-tool{background:transparent;border:1px solid transparent;border-radius:7px;color:var(--dsw-alias-label-secondary,#aaa);cursor:pointer;font:inherit;font-size:12px;padding:4px 9px;white-space:nowrap}",
			".wt-tool:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));color:var(--dsw-alias-label-primary,#eee)}",
			".wt-empty{color:var(--dsw-alias-label-tertiary,#888);font-size:12px;align-self:center;padding:0 6px 6px}",
			".wt-add{flex:none;display:flex;align-items:center;justify-content:center;width:26px;height:26px;margin:0 2px 0 0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#aaa);cursor:pointer;font:inherit;font-size:18px;line-height:1;padding:0}",
			".wt-add:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18));color:var(--dsw-alias-label-primary,#eee)}",
			".wt-add:focus-visible{outline:2px solid var(--dsw-alias-label-primary-bluish,#4da3ff);outline-offset:-1px}",
			".wt-modal{position:fixed;inset:0;z-index:2100;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-bg-mask-modal,#000) 55%,transparent);pointer-events:auto;font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif)}",
			".wt-dialog{width:min(680px,92vw);max-height:min(580px,86vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#171717));border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.4));border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.5);color:var(--dsw-alias-label-primary,#eee);font-size:13px;line-height:1.4;overflow:hidden}",
			".wt-dlg-title{flex:1;min-width:0;padding:14px 16px 10px;font-size:15px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3))}",
			".wt-dlg-crumb{display:flex;align-items:center;gap:2px;padding:4px 10px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3));font-size:12px;color:var(--dsw-alias-label-tertiary,#888)}",
			".wt-dlg-crumb button{background:transparent;border:none;color:var(--dsw-alias-label-secondary,#aaa);cursor:pointer;font:inherit;padding:2px 5px;border-radius:4px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".wt-dlg-crumb button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,#eee)}",
			".wt-dlg-crumb button.wt-here{color:var(--dsw-alias-label-primary,#eee);font-weight:600}",
			".wt-dlg-body{flex:1;min-height:180px;overflow:auto;padding:6px}",
			".wt-dlg-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;border:none;color:var(--dsw-alias-label-primary,#eee);cursor:pointer;font:inherit;font-size:13px;padding:5px 10px;border-radius:8px}",
			".wt-dlg-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}",
			".wt-dlg-row.wt-dlg-sel{background:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.3))}",
			".wt-dlg-row-icon{flex:none;font-size:14px;line-height:1}",
			".wt-dlg-row-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".wt-dlg-row-go{flex:none;color:var(--dsw-alias-label-tertiary,#888);font-size:13px}",
			".wt-dlg-empty{color:var(--dsw-alias-label-tertiary,#888);padding:26px 12px;text-align:center;font-size:12px}",
			".wt-dlg-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.3))}",
			".wt-dlg-err{flex:1;color:var(--dsw-alias-state-error-primary,#f47067);font-size:12px;min-width:140px}",
			".wt-dlg-create{display:flex;align-items:center;gap:8px;flex:1;min-width:200px}",
			".wt-dlg-create input{flex:1;min-width:120px;background:var(--dsw-alias-bg-base,#101010);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:7px;color:var(--dsw-alias-label-primary,#eee);font:inherit;font-size:12px;padding:5px 8px}",
			".wt-dlg-btn{background:transparent;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));color:var(--dsw-alias-label-primary,#eee);border-radius:7px;cursor:pointer;font:inherit;font-size:12px;padding:5px 12px;white-space:nowrap}",
			".wt-dlg-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.18))}",
			".wt-dlg-btn:disabled{opacity:.5;cursor:not-allowed}",
			".wt-dlg-btn.wt-primary{border-color:var(--dsw-alias-label-primary-bluish,#4da3ff);color:var(--dsw-alias-label-primary-bluish,#4da3ff)}",
			".wt-dlg-toggle{background:transparent;border:none;color:var(--dsw-alias-label-secondary,#aaa);cursor:pointer;font:inherit;font-size:12px;padding:5px 8px;border-radius:6px}",
			".wt-dlg-toggle:hover{color:var(--dsw-alias-label-primary,#eee);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}",
		].join("\n");

		if (typeof document !== "undefined") {
			let styleTag = document.querySelector("style[data-plugin='dsh-workspace-tabs']");
			if (styleTag === null) {
				styleTag = document.createElement("style");
				styleTag.dataset.plugin = "dsh-workspace-tabs";
				document.head.appendChild(styleTag);
			}
			styleTag.textContent = css;
		}

		function readStorage(storage, key, fallback) {
			try {
				const raw = storage?.getItem?.(key);
				return raw === undefined || raw === null || raw === "" ? fallback : raw;
			} catch {
				return fallback;
			}
		}

		function writeStorage(storage, key, value) {
			try { storage?.setItem?.(key, value); } catch { /* quota / private mode */ }
		}

		function defaultStorage() {
			try {
				return typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;
			} catch {
				return undefined;
			}
		}

		/** Last path segment across posix and windows separators. */
		function basenameOf(path) {
			const value = String(path ?? "").replace(/[/\\]+$/, "");
			if (!value) return "";
			const parts = value.split(/[/\\]/);
			return parts[parts.length - 1] || value;
		}

		/** User-visible workspace label: title, else folder name, else short id. */
		function workspaceTitle(workspace) {
			if (!workspace) return "";
			const title = String(workspace.title ?? "").trim();
			if (title) return title;
			const base = basenameOf(workspace.path);
			if (base) return base;
			return String(workspace.workspaceId ?? "").slice(0, 12) || "Workspace";
		}

		function archivedSet(archivedSessionIds) {
			return new Set(archivedSessionIds ?? []);
		}

		/** Count badge per tab: listed, non-archived, non-blank sessions. */
		function countSessions(workspace, sessionsSnap, archivedSessionIds) {
			if (!workspace || !sessionsSnap) return 0;
			const archived = archivedSet(archivedSessionIds);
			let count = 0;
			for (const id of workspace.sessionIds ?? []) {
				if (archived.has(id)) continue;
				const summary = sessionsSnap.byId?.[id];
				if (!summary || summary.blank) continue;
				count += 1;
			}
			return count;
		}

		function workspaceRunning(workspace, sessionsSnap, archivedSessionIds) {
			if (!workspace || !sessionsSnap) return false;
			const archived = archivedSet(archivedSessionIds);
			for (const id of workspace.sessionIds ?? []) {
				if (archived.has(id)) continue;
				if (sessionsSnap.byId?.[id]?.running) return true;
			}
			return false;
		}

		function tabModel(items, sessionsSnap, archivedSessionIds) {
			return (items ?? []).map((workspace) => ({
				workspaceId: workspace.workspaceId,
				title: workspaceTitle(workspace),
				path: workspace.path ?? "",
				count: countSessions(workspace, sessionsSnap, archivedSessionIds),
				running: workspaceRunning(workspace, sessionsSnap, archivedSessionIds),
			}));
		}

		function ownerWorkspaceId(items, sessionId) {
			if (!sessionId) return null;
			for (const workspace of items ?? []) {
				if ((workspace.sessionIds ?? []).includes(sessionId)) return workspace.workspaceId;
			}
			return null;
		}

		function recentWorkspaceId(items, sessionsSnap, archivedSessionIds) {
			let selected = null;
			let selectedTime = Number.NEGATIVE_INFINITY;
			const archived = archivedSet(archivedSessionIds);
			for (const workspace of items ?? []) {
				let latest = Number.NEGATIVE_INFINITY;
				for (const id of workspace.sessionIds ?? []) {
					if (archived.has(id)) continue;
					const summary = sessionsSnap?.byId?.[id];
					if (summary) latest = Math.max(latest, summary.updatedAt ?? Number.NEGATIVE_INFINITY);
				}
				if (latest === Number.NEGATIVE_INFINITY) {
					const created = Date.parse(workspace.createdAt ?? "");
					latest = Number.isNaN(created) ? Number.NEGATIVE_INFINITY : created;
				}
				if (selected === null || latest > selectedTime) {
					selected = workspace.workspaceId;
					selectedTime = latest;
				}
			}
			return selected;
		}

		/**
		 * Effective tab selection: the current session's account wins (tabs
		 * follow sidebar navigation, including ungrouped sessions), then the
		 * persisted pick, then the most recently active workspace.
		 */
		function effectiveSelection(items, sessionsSnap, archivedSessionIds, persistedId) {
			const list = items ?? [];
			const current = sessionsSnap?.current;
			if (current && sessionsSnap?.byId?.[current]) {
				const owned = ownerWorkspaceId(list, current);
				if (owned && list.some((workspace) => workspace.workspaceId === owned)) {
					return { kind: "workspace", workspaceId: owned };
				}
				return { kind: "ungrouped" };
			}
			if (persistedId === UNGROUPED_ID) return { kind: "ungrouped" };
			if (persistedId && list.some((workspace) => workspace.workspaceId === persistedId)) {
				return { kind: "workspace", workspaceId: persistedId };
			}
			const recent = recentWorkspaceId(list, sessionsSnap, archivedSessionIds);
			if (recent) return { kind: "workspace", workspaceId: recent };
			if (list.length > 0) return { kind: "workspace", workspaceId: list[0].workspaceId };
			return { kind: "ungrouped" };
		}

		function selectionKey(selection) {
			return selection.kind === "workspace" ? selection.workspaceId : UNGROUPED_ID;
		}

		function isSelectionEqual(left, right) {
			return !!left && !!right && left.kind === right.kind &&
				(left.kind === "ungrouped" || left.workspaceId === right.workspaceId);
		}

		/** Sessions outside every workspace account (host order preserved). */
		function ungroupedSessionIds(items, sessionsSnap, archivedSessionIds) {
			if (!sessionsSnap) return [];
			const archived = archivedSet(archivedSessionIds);
			const accounted = new Set();
			for (const workspace of items ?? []) {
				for (const id of workspace.sessionIds ?? []) accounted.add(id);
			}
			return (sessionsSnap.ids ?? []).filter((id) => !accounted.has(id) && !archived.has(id));
		}

		/**
		 * Session ids visible under one tab: the workspace account (or the
		 * ungrouped set), plus subagent descendants of visible parents so
		 * running badges and catalog rows keep their parents.
		 */
		function allowedSessionIds(selection, items, sessionsSnap, archivedSessionIds) {
			const archived = archivedSet(archivedSessionIds);
			const allowed = new Set();
			if (selection.kind === "workspace") {
				const workspace = (items ?? []).find((item) => item.workspaceId === selection.workspaceId);
				for (const id of workspace?.sessionIds ?? []) {
					if (!archived.has(id)) allowed.add(id);
				}
			} else {
				for (const id of ungroupedSessionIds(items, sessionsSnap, archivedSessionIds)) allowed.add(id);
			}
			const byId = sessionsSnap?.byId ?? {};
			let grown = true;
			while (grown) {
				grown = false;
				for (const id of Object.keys(byId)) {
					if (allowed.has(id) || archived.has(id)) continue;
					const parentId = byId[id]?.parentId;
					if (parentId && allowed.has(parentId)) {
						allowed.add(id);
						grown = true;
					}
				}
			}
			return allowed;
		}

		/**
		 * Filter BOTH ids and byId: the native local list and the host content
		 * search both resolve through byId, so ids-only filtering would leak
		 * other workspaces' search hits into the scoped view.
		 */
		function filterSessionsSnapshot(sessionsSnap, allowed) {
			if (!sessionsSnap || !allowed) return sessionsSnap;
			const byId = {};
			for (const id of allowed) {
				if (sessionsSnap.byId?.[id] !== undefined) byId[id] = sessionsSnap.byId[id];
			}
			const current = allowed.has(sessionsSnap.current) ? sessionsSnap.current : undefined;
			const subagentsByParent = {};
			for (const [parentId, catalog] of Object.entries(sessionsSnap.subagentsByParent ?? {})) {
				if (allowed.has(parentId)) subagentsByParent[parentId] = catalog;
			}
			const jobsBySession = {};
			for (const [sessionId, jobs] of Object.entries(sessionsSnap.jobsBySession ?? {})) {
				if (allowed.has(sessionId)) jobsBySession[sessionId] = jobs;
			}
			return {
				...sessionsSnap,
				ids: (sessionsSnap.ids ?? []).filter((id) => allowed.has(id)),
				byId,
				current,
				currentAddress: current === undefined ? undefined : sessionsSnap.currentAddress,
				subagentsByParent,
				jobsBySession,
			};
		}

		/** Scope the native workspace list to the selected account. Ungrouped
		 * tabs intentionally show no project group — the native Ungrouped
		 * section carries those rows. */
		function filterWorkspacesSnapshot(workspacesSnap, selection) {
			if (!workspacesSnap) return workspacesSnap;
			if (selection.kind !== "workspace") return { ...workspacesSnap, items: [] };
			const workspace = (workspacesSnap.items ?? []).find((item) => item.workspaceId === selection.workspaceId);
			return { ...workspacesSnap, items: workspace ? [workspace] : [] };
		}

		/**
		 * Pure half of tab switching: stay on the current session when it already
		 * belongs to the target, else open its most-recent chat, reuse a blank
		 * placeholder, create a session for an empty workspace, or stay put for
		 * an empty Ungrouped tab (there is no workspace to create in).
		 */
		function pickSessionTarget(selection, items, sessionsSnap, archivedSessionIds) {
			if (!selection) return { action: "none" };
			const archived = archivedSet(archivedSessionIds);
			let candidateIds;
			if (selection.kind === "workspace") {
				const workspace = (items ?? []).find((item) => item.workspaceId === selection.workspaceId);
				if (!workspace) return { action: "none" };
				candidateIds = workspace.sessionIds ?? [];
			} else {
				candidateIds = ungroupedSessionIds(items, sessionsSnap, archivedSessionIds);
			}
			const rows = [];
			for (const id of candidateIds) {
				if (archived.has(id)) continue;
				const summary = sessionsSnap?.byId?.[id];
				if (summary) rows.push(summary);
			}
			if (sessionsSnap?.current && rows.some((row) => row.id === sessionsSnap.current)) {
				return { action: "open", sessionId: sessionsSnap.current };
			}
			const chats = rows.filter((row) => !row.blank).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
			if (chats.length > 0) return { action: "open", sessionId: chats[0].id };
			const blanks = rows.filter((row) => row.blank);
			if (blanks.length > 0) return { action: "open", sessionId: blanks[0].id };
			if (selection.kind === "workspace") return { action: "create", workspaceId: selection.workspaceId };
			return { action: "none" };
		}

		/** Persisted tab pick; the effective selection is derived per render. */
		function createSelectionStore(storage) {
			let persisted = readStorage(storage, SELECTED_KEY, null);
			const listeners = new Set();
			return {
				subscribe(listener) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				getSnapshot() {
					return persisted;
				},
				set(id) {
					if (persisted === id) return;
					persisted = id;
					writeStorage(storage, SELECTED_KEY, id);
					for (const listener of [...listeners]) listener();
				},
			};
		}

		/**
		 * Find the native sidebar.workspaces entry: anything that is not our
		 * wrapper (ours is marked so HMR leftovers never read as native).
		 */
		function findNativeEntry(entries, ownComponent) {
			for (const entry of entries ?? []) {
				if (!entry || entry.component === ownComponent) continue;
				if (entry.component && entry.component.__wtWrapper === true) continue;
				return entry;
			}
			return null;
		}

		/**
		 * Shadow spec cloning the native entry: identical inject/store so the
		 * renderer assembles the same callbacks, shared store seat, and
		 * locale. `children` is intentionally NOT cloned: child slots are
		 * declared once per page, and re-declaring
		 * sidebar.workspaces.directoryFlow throws — the wrapper instead
		 * disables the directory flow (see useNoDirectoryFlow) and nulls
		 * renderSlot. Single slots elect by ascending priority ("lowest
		 * renders"), and third-party plugins keep their caller-supplied
		 * priority, so the shadow takes one rank below the native entry.
		 * Registrant is left for our own fiber stamp.
		 */
		function buildShadowSpec(nativeEntry) {
			const spec = { name: SIDEBAR_WORKSPACES_SLOT, ...(nativeEntry.options ?? {}) };
			spec.priority = (nativeEntry.options?.priority ?? 0) - 1;
			if (nativeEntry.inject !== undefined) spec.inject = nativeEntry.inject;
			if (nativeEntry.store !== undefined) spec.store = nativeEntry.store;
			if (nativeEntry.locale !== undefined) spec.locale = nativeEntry.locale;
			if (nativeEntry.select !== undefined) spec.select = nativeEntry.select;
			return spec;
		}

		/**
		 * The shadow cannot re-declare the native directory-flow child slot,
		 * so the add-workspace picker flow is switched off inside the scoped
		 * browser: the header "+" button hides and the flow can never open.
		 * Workspace creation stays available from the empty-state hero picker.
		 */
		function useNoDirectoryFlow() {
			return false;
		}

		function renderNoSlot() {
			return null;
		}

		const guardedActionsCache = typeof WeakMap === "function" ? new WeakMap() : null;

		/**
		 * The native browser prunes persisted group expansion/order keys for
		 * accounts it cannot see. Union the full registry keys back in so tab
		 * switching never erases other workspaces' sidebar state.
		 */
		function guardActions(actions, getFullKeys) {
			if (!actions || typeof actions.retainAccountKeys !== "function") return actions;
			if (guardedActionsCache) {
				const cached = guardedActionsCache.get(actions);
				if (cached && cached.getFullKeys === getFullKeys) return cached.guarded;
			}
			const guarded = {
				...actions,
				retainAccountKeys: (keys) => actions.retainAccountKeys(
					Array.from(new Set([...(keys ?? []), "", FLAT_SESSION_ORDER_KEY, ...getFullKeys()])),
				),
			};
			if (guardedActionsCache) guardedActionsCache.set(actions, { guarded, getFullKeys });
			return guarded;
		}

		/** Selector-hook factory over a filtered snapshot source. Native hooks
		 * are called as useX(selector); equality args are render-only hints
		 * this shim safely ignores. */
		function makeSelectorHook(subscribeAll, getFilteredSnapshot) {
			return function useFilteredSnapshot(selector) {
				const snapshot = React.useSyncExternalStore(subscribeAll, getFilteredSnapshot, getFilteredSnapshot);
				return typeof selector === "function" ? selector(snapshot) : snapshot;
			};
		}

		function frameElement() {
			if (typeof document === "undefined" || !document.querySelector) return null;
			const overlay = document.querySelector("[data-shell-overlay]");
			return overlay?.parentElement ?? null;
		}

		function useListRevision(services, selection) {
			const [, setRevision] = React.useState(0);
			React.useEffect(() => {
				const bump = () => setRevision((value) => value + 1);
				const offs = [];
				const offSessions = services.sessions?.list?.subscribe?.(bump);
				const offWorkspaces = services.workspaces?.list?.subscribe?.(bump);
				const offSelection = selection?.subscribe?.(bump);
				if (typeof offSessions === "function") offs.push(offSessions);
				if (typeof offWorkspaces === "function") offs.push(offWorkspaces);
				if (typeof offSelection === "function") offs.push(offSelection);
				return () => {
					for (const off of offs) off();
				};
			}, [services, selection]);
		}

		/** Identity-stable filtered view over the live snapshots. */
		function createFilteredView(services, selection) {
			let cache = null;
			return {
				compute() {
					const wsSnap = services.workspaces?.list?.getSnapshot?.();
					const seSnap = services.sessions?.list?.getSnapshot?.();
					const persisted = selection?.getSnapshot?.() ?? null;
					if (cache && cache.wsSnap === wsSnap && cache.seSnap === seSnap && cache.persisted === persisted) {
						return cache.view;
					}
					const items = wsSnap?.items ?? [];
					const archived = wsSnap?.archivedSessionIds ?? [];
					const sel = effectiveSelection(items, seSnap, archived, persisted);
					const view = {
						wsSnap,
						seSnap,
						items,
						archived,
						selection: sel,
						filteredWs: filterWorkspacesSnapshot(wsSnap, sel),
						filteredSe: filterSessionsSnapshot(seSnap, allowedSessionIds(sel, items, seSnap, archived)),
					};
					cache = { wsSnap, seSnap, persisted, view };
					return view;
				},
			};
		}

		function createScopedBrowser(shared) {
			function ScopedWorkspaceBrowser(props) {
				useListRevision(shared.services, shared.selection);
				const view = shared.filteredView.compute();
				const subscribeAll = React.useCallback((listener) => {
					const offs = [];
					const offSessions = shared.services.sessions?.list?.subscribe?.(listener);
					const offWorkspaces = shared.services.workspaces?.list?.subscribe?.(listener);
					const offSelection = shared.selection?.subscribe?.(listener);
					if (typeof offSessions === "function") offs.push(offSessions);
					if (typeof offWorkspaces === "function") offs.push(offWorkspaces);
					if (typeof offSelection === "function") offs.push(offSelection);
					return () => {
						for (const off of offs) off();
					};
				}, []);
				const useFilteredSessions = React.useMemo(
					() => makeSelectorHook(subscribeAll, () => shared.filteredView.compute().filteredSe),
					[subscribeAll, view.filteredSe],
				);
				const useFilteredWorkspaces = React.useMemo(
					() => makeSelectorHook(subscribeAll, () => shared.filteredView.compute().filteredWs),
					[subscribeAll, view.filteredWs],
				);
				const actions = React.useMemo(
					() => guardActions(props.actions, () => (shared.services.workspaces?.list?.getSnapshot?.()?.items ?? [])
						.map((workspace) => workspace.workspaceId)),
					[props.actions],
				);
				const Native = shared.nativeRef.current;
				if (!Native) return null;
				return React.createElement(Native, {
					...props,
					useSessions: useFilteredSessions,
					useWorkspaces: useFilteredWorkspaces,
					useDirectoryFlow: useNoDirectoryFlow,
					renderSlot: renderNoSlot,
					actions,
				});
			}
			ScopedWorkspaceBrowser.__wtWrapper = true;
			return ScopedWorkspaceBrowser;
		}

		/** Rows for the add-dialog: dot-directories hidden unless requested. */
		function addRowsFiltered(rows, showHidden) {
			return (rows ?? []).filter((row) => showHidden === true || row.hidden !== true);
		}

		/** Folder to adopt when opening: the selected row, else the listed directory. */
		function adoptTarget(selectedPath, directory) {
			return selectedPath || directory || null;
		}

		/** First workspace bound to `directory` (exact path match), or null. */
		function findWorkspaceByPath(items, directory) {
			if (!directory) return null;
			for (const workspace of items ?? []) {
				if (workspace.path === directory) return workspace;
			}
			return null;
		}

		/**
		 * The tab-bar "+": a self-contained "Add workspace" dialog that browses
		 * host directories over the same browse seam the native composer picker
		 * uses (listDirectory / createDirectory), can create a new folder, and
		 * adopts the chosen directory as a workspace via `adoptAndGo`.
		 */
		function AddWorkspaceDialog({ picker, adoptAndGo, onCancel }) {
			const [directory, setDirectory] = React.useState(null);
			const [crumbs, setCrumbs] = React.useState([]);
			const [rows, setRows] = React.useState([]);
			const [selected, setSelected] = React.useState(null);
			const [showHidden, setShowHidden] = React.useState(false);
			const [error, setError] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const [creating, setCreating] = React.useState(false);
			const [folderDraft, setFolderDraft] = React.useState("");
			const seqRef = React.useRef(0);
			const abortRef = React.useRef(null);

			React.useEffect(() => () => {
				if (abortRef.current) abortRef.current.abort();
			}, []);

			const list = React.useCallback((path) => {
				if (!picker) {
					setError("The workspace folder browser is not available on this page.");
					setBusy(false);
					return;
				}
				const seq = ++seqRef.current;
				if (abortRef.current) abortRef.current.abort();
				const controller = new AbortController();
				abortRef.current = controller;
				setBusy(true);
				setError("");
				setSelected(null);
				picker.list(path, controller.signal).then((listing) => {
					if (seq !== seqRef.current) return;
					setDirectory(listing?.path ?? null);
					setCrumbs(listing?.crumbs ?? []);
					setRows(listing?.entries ?? []);
					setBusy(false);
				}, (reason) => {
					if (seq !== seqRef.current) return;
					setBusy(false);
					setError(reason instanceof Error ? reason.message : String(reason));
				});
			}, [picker]);

			React.useEffect(() => {
				list(undefined); // the browse seam defaults to the home directory
			}, [list]);

			const navigate = React.useCallback((path) => {
				if (path && path !== directory) list(path);
			}, [directory, list]);

			const submitFolder = React.useCallback(async () => {
				const name = folderDraft.trim();
				if (!picker || !directory || name === "") return;
				setBusy(true);
				setError("");
				try {
					const created = await picker.create(directory, name);
					setCreating(false);
					setFolderDraft("");
					await list(directory);
					setSelected(typeof created === "string" ? created : `${directory.replace(/[\\/]+$/, "")}/${name}`);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
					setBusy(false);
				}
			}, [picker, directory, folderDraft, list]);

			const openTarget = React.useCallback(async () => {
				const target = adoptTarget(selected, directory);
				if (!target) return;
				setBusy(true);
				setError("");
				try {
					await adoptAndGo(target);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
					setBusy(false);
				}
			}, [selected, directory, adoptAndGo]);

			const visible = addRowsFiltered(rows, showHidden);
			return React.createElement("div", {
				className: "wt-modal",
				onMouseDown: (event) => {
					if (event.target === event.currentTarget && !creating) onCancel();
				},
			},
				React.createElement("div", {
					className: "wt-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "Add workspace — choose or create a project folder",
					onKeyDown: (event) => {
						if (event.key !== "Escape") return;
						event.stopPropagation();
						if (creating) {
							setCreating(false);
							setFolderDraft("");
						} else {
							onCancel();
						}
					},
				},
					React.createElement("div", { className: "wt-dlg-title" }, "Add workspace — choose or create a project folder"),
					React.createElement("div", { className: "wt-dlg-crumb" },
						(crumbs ?? []).map((crumb, index) => React.createElement(React.Fragment, { key: `${crumb.path}:${index}` },
							index > 0 ? React.createElement("span", { "aria-hidden": true }, " / ") : null,
							React.createElement("button", {
								type: "button",
								className: crumb.path === directory ? "wt-here" : undefined,
								title: crumb.path,
								onClick: () => navigate(crumb.path),
							}, crumb.name),
						)),
						React.createElement("button", {
							type: "button",
							className: "wt-dlg-toggle",
							title: showHidden ? "Hide dot folders" : "Show dot folders",
							onClick: () => setShowHidden(!showHidden),
						}, showHidden ? "Hide hidden" : "Show hidden"),
					),
					React.createElement("div", { className: "wt-dlg-body", role: "listbox", "aria-label": "Project folders", tabIndex: 0 },
						busy && visible.length === 0 ? React.createElement("div", { className: "wt-dlg-empty" }, "Loading folders…")
							: visible.length === 0 ? React.createElement("div", { className: "wt-dlg-empty" }, error || "No folders here.")
								: visible.map((row) => React.createElement("button", {
									key: row.path,
									type: "button",
									role: "option",
									"aria-selected": selected === row.path,
									className: "wt-dlg-row" + (selected === row.path ? " wt-dlg-sel" : ""),
									title: row.path,
									onClick: () => setSelected(row.path),
									onDoubleClick: () => navigate(row.path),
								},
									React.createElement("span", { className: "wt-dlg-row-icon", "aria-hidden": true }, "📁"),
									React.createElement("span", { className: "wt-dlg-row-name" }, row.name),
									React.createElement("button", {
										type: "button",
										className: "wt-dlg-row-go",
										title: "Open this folder",
										onClick: (event) => {
											event.stopPropagation();
											navigate(row.path);
										},
									}, "›"),
								)),
					),
					React.createElement("div", { className: "wt-dlg-foot" },
						error ? React.createElement("span", { className: "wt-dlg-err", role: "alert" }, error) : React.createElement("span", { className: "wt-dlg-err" }),
						creating ? React.createElement("div", { className: "wt-dlg-create" },
							React.createElement("input", {
								type: "text",
								value: folderDraft,
								"aria-label": "New folder name",
								placeholder: "Untitled folder",
								autoFocus: true,
								disabled: busy,
								onChange: (event) => setFolderDraft(event.target.value),
								onKeyDown: (event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void submitFolder();
									}
								},
							}),
							React.createElement("button", { type: "button", className: "wt-dlg-btn wt-primary", disabled: busy || folderDraft.trim() === "", onClick: () => void submitFolder() }, "Create"),
							React.createElement("button", { type: "button", className: "wt-dlg-btn", disabled: busy, onClick: () => { setCreating(false); setFolderDraft(""); } }, "Cancel"),
						) : React.createElement(React.Fragment, null,
							React.createElement("button", { type: "button", className: "wt-dlg-btn", disabled: busy, onClick: () => { setCreating(true); setFolderDraft(""); } }, "New folder"),
							React.createElement("button", { type: "button", className: "wt-dlg-btn", disabled: busy, onClick: onCancel }, "Cancel"),
							React.createElement("button", { type: "button", className: "wt-dlg-btn wt-primary", disabled: busy || !directory, onClick: () => void openTarget() }, "Open"),
						),
					),
				),
			);
		}

		function WorkspaceTabs({ shared }) {
			useListRevision(shared.services, shared.selection);
			const [status, setStatus] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [, setTick] = React.useState(0);
			const [addOpen, setAddOpen] = React.useState(false);
			const [addPicker, setAddPicker] = React.useState(null);
			const inflight = React.useRef(new Map());

			React.useEffect(() => {
				shared.revisionBump = () => setTick((value) => value + 1);
				return () => {
					if (shared.revisionBump) shared.revisionBump = null;
				};
			}, [shared]);

			const view = shared.filteredView.compute();
			const tabs = React.useMemo(
				() => tabModel(view.items, view.seSnap, view.archived),
				[view.items, view.seSnap, view.archived],
			);
			const ungroupedIds = React.useMemo(
				() => ungroupedSessionIds(view.items, view.seSnap, view.archived),
				[view.items, view.seSnap, view.archived],
			);
			const ungroupedRunning = React.useMemo(
				() => ungroupedIds.some((id) => view.seSnap?.byId?.[id]?.running === true),
				[ungroupedIds, view.seSnap],
			);
			const activeKey = selectionKey(view.selection);
			const loading = view.wsSnap?.phase !== "ready" || view.seSnap?.phase !== "ready";
			const shownStatus = status ?? (shared.shadowError ? { error: true, text: shared.shadowError } : null);

			// Reserve room for the tab bar by offsetting the app frame.
			React.useEffect(() => {
				const frame = frameElement();
				if (!frame || !frame.style) return undefined;
				const prev = { marginTop: frame.style.marginTop, height: frame.style.height };
				frame.style.marginTop = `${TAB_BAR_PX}px`;
				frame.style.height = `calc(100% - ${TAB_BAR_PX}px)`;
				return () => {
					frame.style.marginTop = prev.marginTop;
					frame.style.height = prev.height;
				};
			}, []);

			const performTarget = React.useCallback((target) => {
				const sessions = shared.services.sessions;
				if (!sessions || target.action === "none") return Promise.resolve();
				if (target.action === "open") {
					sessions.open(target.sessionId);
					return Promise.resolve();
				}
				let attempt = inflight.current.get(target.workspaceId);
				if (!attempt) {
					setBusy(true);
					setStatus(null);
					attempt = sessions.create({ workspaceId: target.workspaceId }).then(
						(sessionId) => {
							inflight.current.delete(target.workspaceId);
							setBusy(false);
							if (sessionId) sessions.open(sessionId);
						},
						(error) => {
							inflight.current.delete(target.workspaceId);
							setBusy(false);
							setStatus({ error: true, text: error instanceof Error ? error.message : "Could not start a session." });
						},
					);
					inflight.current.set(target.workspaceId, attempt);
				}
				return attempt;
			}, [shared]);

			const selectTab = React.useCallback((key) => {
				shared.selection.set(key);
				setStatus(null);
				const selection = key === UNGROUPED_ID
					? { kind: "ungrouped" }
					: { kind: "workspace", workspaceId: key };
				performTarget(pickSessionTarget(selection, view.items, view.seSnap, view.archived)).catch(() => {});
			}, [shared, view.items, view.seSnap, view.archived, performTarget]);

			const toggleSidebar = React.useCallback(() => {
				try {
					shared.layout?.toggleSidebar?.();
				} catch {
					/* layout service unavailable */
				}
			}, [shared]);

			const adoptAndGo = React.useCallback(async (path) => {
				const workspacesSvc = shared.services.workspaces;
				if (!workspacesSvc) throw new Error("Workspace services are unavailable.");
				const result = await workspacesSvc.create({ path });
				if (!result || result.ok !== true) {
					throw new Error(result?.error?.message ?? "Could not add the workspace.");
				}
				const workspace = result.value?.workspace;
				if (!workspace || !workspace.workspaceId) throw new Error("Could not add the workspace.");
				shared.selection.set(workspace.workspaceId);
				const fresh = shared.filteredView.compute();
				const target = pickSessionTarget(
					{ kind: "workspace", workspaceId: workspace.workspaceId },
					fresh.items,
					fresh.seSnap,
					fresh.archived,
				);
				await performTarget(target);
				setAddOpen(false);
			}, [shared, performTarget]);

			const openAddDialog = React.useCallback(() => {
				setAddPicker(typeof shared.getPicker === "function" ? shared.getPicker() : null);
				setAddOpen(true);
			}, [shared]);

			return React.createElement("div", {
				className: "wt-root",
				"data-workspace-tabs": "1",
				style: addOpen ? { zIndex: 2600 } : undefined,
			},
				React.createElement("div", { className: "wt-tabs", role: "tablist", "aria-label": "Workspaces" },
					loading
						? React.createElement("div", { className: "wt-empty" }, "Loading workspaces…")
						: React.createElement("div", { className: "wt-tablist" },
							React.createElement("button", {
								key: "__add",
								type: "button",
								className: "wt-add",
								"aria-label": "Add workspace",
								title: "Add a new project — choose or create a folder",
								onClick: openAddDialog,
							}, "+"),
							tabs.map((tab) => React.createElement("button", {
								key: tab.workspaceId,
								type: "button",
								role: "tab",
								"aria-selected": tab.workspaceId === activeKey,
								className: "wt-tab" + (tab.workspaceId === activeKey ? " wt-active" : ""),
								title: tab.path || tab.title,
								onClick: () => selectTab(tab.workspaceId),
							},
								tab.running ? React.createElement("span", { className: "wt-dot", title: "Running session" }) : null,
								React.createElement("span", { className: "wt-tab-name" }, tab.title),
								React.createElement("span", { className: "wt-count" }, String(tab.count)),
							)),
							ungroupedIds.length > 0 || activeKey === UNGROUPED_ID
								? React.createElement("button", {
									key: UNGROUPED_ID,
									type: "button",
									role: "tab",
									"aria-selected": activeKey === UNGROUPED_ID,
									className: "wt-tab" + (activeKey === UNGROUPED_ID ? " wt-active" : ""),
									title: "Sessions outside every workspace",
									onClick: () => selectTab(UNGROUPED_ID),
								},
									ungroupedRunning ? React.createElement("span", { className: "wt-dot", title: "Running session" }) : null,
									React.createElement("span", { className: "wt-tab-name" }, "Ungrouped"),
									React.createElement("span", { className: "wt-count" }, String(ungroupedIds.length)),
								)
								: null,
							tabs.length === 0 && ungroupedIds.length === 0
								? React.createElement("div", { className: "wt-empty" }, "No workspaces yet")
								: null,
						),
					React.createElement("div", { className: "wt-side" },
						shownStatus ? React.createElement("span", {
							className: "wt-status" + (shownStatus.error ? " wt-error" : ""),
							role: "status",
						}, busy ? "Starting session…" : shownStatus.text) : null,
						shared.layout ? React.createElement("button", {
							type: "button",
							className: "wt-tool",
							title: "Toggle the sidebar",
							onClick: toggleSidebar,
						}, "▤") : null,
					),
				),
				addOpen ? React.createElement(AddWorkspaceDialog, {
					picker: addPicker,
					adoptAndGo,
					onCancel: () => setAddOpen(false),
				}) : null,
			);
		}

		/** A browse seam over the directory picker, or null when unavailable. */
		function pickerFace(ctx) {
			if (!ctx || typeof ctx.get !== "function") return null;
			try {
				const uiWorkspace = ctx.get("uiWorkspace");
				if (uiWorkspace && typeof uiWorkspace.listDirectory === "function" && typeof uiWorkspace.createDirectory === "function") {
					return {
						list: (path, signal) => uiWorkspace.listDirectory(path, signal),
						create: (path, name) => uiWorkspace.createDirectory(path, name),
					};
				}
			} catch {
				/* uiWorkspace not registered yet */
			}
			try {
				const remote = ctx.get("remote");
				const picker = remote?.directoryPicker;
				if (picker && typeof picker.list === "function" && typeof picker.createDirectory === "function") {
					return {
						list: async (path, signal) => {
							const result = await picker.list(path, signal);
							if (!result || result.ok !== true) throw new Error(result?.error?.message ?? "Could not list the folder.");
							return result.value;
						},
						create: async (path, name) => {
							const result = await picker.createDirectory(path, name);
							if (!result || result.ok !== true) throw new Error(result?.error?.message ?? "Could not create the folder.");
							return result.value;
						},
					};
				}
			} catch {
				/* remote seam absent */
			}
			return null;
		}

		const inject = ["slots", "sessions", "workspaces"];

		function apply(ctx) {
			const sessions = ctx.get("sessions");
			const workspaces = ctx.get("workspaces");
			let layout = null;
			try {
				layout = ctx.get("layout");
			} catch {
				layout = null;
			}
			const selection = createSelectionStore(defaultStorage());
			const shared = {
				services: { sessions, workspaces },
				layout,
				selection,
				nativeRef: { current: null },
				filteredView: null,
				shadowError: null,
				revisionBump: null,
				getPicker: () => pickerFace(ctx),
			};
			shared.filteredView = createFilteredView(shared.services, selection);
			const ScopedWorkspaceBrowser = createScopedBrowser(shared);

			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "workspace-tabs",
				order: 10,
				label: "Workspace tabs",
			}, function WorkspaceTabsOverlay() {
				return React.createElement(WorkspaceTabs, { shared });
			}));

			ctx.slots.inject(SIDEBAR_WORKSPACES_SLOT, () => {
				let disposeShadow = null;
				let lastNative = null;
				let retryTimer = null;
				const stopRetry = () => {
					if (retryTimer !== null) {
						globalThis.clearInterval?.(retryTimer);
						retryTimer = null;
					}
				};
				const fail = (error) => {
					shared.shadowError = error instanceof Error ? error.message : String(error);
					shared.revisionBump?.();
				};
				const update = () => {
					let entries = [];
					try {
						entries = ctx.slots.entries(SIDEBAR_WORKSPACES_SLOT) ?? [];
					} catch (error) {
						fail(error);
						return;
					}
					const native = findNativeEntry(entries, ScopedWorkspaceBrowser);
					if (!native) {
						if (disposeShadow) {
							disposeShadow();
							disposeShadow = null;
						}
						lastNative = null;
						shared.nativeRef.current = null;
						return;
					}
					if (native === lastNative && disposeShadow) return;
					if (disposeShadow) {
						disposeShadow();
						disposeShadow = null;
					}
					lastNative = native;
					shared.nativeRef.current = native.component;
					try {
						disposeShadow = ctx.slots.register(buildShadowSpec(native), ScopedWorkspaceBrowser);
						shared.shadowError = null;
						stopRetry();
					} catch (error) {
						disposeShadow = null;
						fail(error);
					}
				};
				update();
				// The native entry can arrive after us (HMR swaps, load order):
				// keep asserting until the shadow is established.
				if (typeof globalThis.setInterval === "function") {
					retryTimer = globalThis.setInterval(() => {
						if (disposeShadow) {
							stopRetry();
							return;
						}
						update();
					}, 1500);
					if (typeof retryTimer === "object" && retryTimer?.unref) {
						try { retryTimer.unref(); } catch { /* ignore */ }
					}
				}
				const off = typeof ctx.slots.subscribe === "function"
					? ctx.slots.subscribe(SIDEBAR_WORKSPACES_SLOT, update)
					: null;
				return [
					() => {
						if (typeof off === "function") off();
					},
					() => {
						stopRetry();
						if (disposeShadow) {
							disposeShadow();
							disposeShadow = null;
						}
						lastNative = null;
						shared.nativeRef.current = null;
					},
				];
			});
		}

		exports.TAB_BAR_PX = TAB_BAR_PX;
		exports.SELECTED_KEY = SELECTED_KEY;
		exports.UNGROUPED_ID = UNGROUPED_ID;
		exports.FLAT_SESSION_ORDER_KEY = FLAT_SESSION_ORDER_KEY;
		exports.SIDEBAR_WORKSPACES_SLOT = SIDEBAR_WORKSPACES_SLOT;
		exports.basenameOf = basenameOf;
		exports.workspaceTitle = workspaceTitle;
		exports.archivedSet = archivedSet;
		exports.countSessions = countSessions;
		exports.workspaceRunning = workspaceRunning;
		exports.tabModel = tabModel;
		exports.ownerWorkspaceId = ownerWorkspaceId;
		exports.recentWorkspaceId = recentWorkspaceId;
		exports.effectiveSelection = effectiveSelection;
		exports.selectionKey = selectionKey;
		exports.isSelectionEqual = isSelectionEqual;
		exports.ungroupedSessionIds = ungroupedSessionIds;
		exports.allowedSessionIds = allowedSessionIds;
		exports.filterSessionsSnapshot = filterSessionsSnapshot;
		exports.filterWorkspacesSnapshot = filterWorkspacesSnapshot;
		exports.pickSessionTarget = pickSessionTarget;
		exports.createSelectionStore = createSelectionStore;
		exports.findNativeEntry = findNativeEntry;
		exports.buildShadowSpec = buildShadowSpec;
		exports.useNoDirectoryFlow = useNoDirectoryFlow;
		exports.renderNoSlot = renderNoSlot;
		exports.guardActions = guardActions;
		exports.makeSelectorHook = makeSelectorHook;
		exports.createFilteredView = createFilteredView;
		exports.createScopedBrowser = createScopedBrowser;
		exports.addRowsFiltered = addRowsFiltered;
		exports.adoptTarget = adoptTarget;
		exports.findWorkspaceByPath = findWorkspaceByPath;
		exports.AddWorkspaceDialog = AddWorkspaceDialog;
		exports.WorkspaceTabs = WorkspaceTabs;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
