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
 * navigating through the sidebar keeps the tabs in sync.
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

		function WorkspaceTabs({ shared }) {
			useListRevision(shared.services, shared.selection);
			const [status, setStatus] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const [, setTick] = React.useState(0);
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

			return React.createElement("div", { className: "wt-root", "data-workspace-tabs": "1" },
				React.createElement("div", { className: "wt-tabs", role: "tablist", "aria-label": "Workspaces" },
					loading
						? React.createElement("div", { className: "wt-empty" }, "Loading workspaces…")
						: React.createElement("div", { className: "wt-tablist" },
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
			);
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
		exports.WorkspaceTabs = WorkspaceTabs;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
