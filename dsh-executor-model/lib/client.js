window.__ModuleLoader__.load({ id: "dsh-executor-model", factory: (require) => { const module = { exports: {} }; const exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  CallerChip: () => CallerChip,
  EXPLANATION: () => EXPLANATION,
  ExecutorModelControls: () => ExecutorModelControls,
  ExecutorModelSelect: () => ExecutorModelSelect,
  ExecutorSelectionController: () => ExecutorSelectionController,
  ExecutorToolCard: () => ExecutorToolCard,
  apply: () => apply,
  catalogChoices: () => catalogChoices,
  catalogModelName: () => catalogModelName,
  executorCallInfo: () => executorCallInfo,
  findCatalogChild: () => findCatalogChild,
  inject: () => inject,
  installRefreshListeners: () => installRefreshListeners,
  lowestAdvertisedEffort: () => lowestAdvertisedEffort,
  modelKey: () => modelKey,
  normalizeSelection: () => normalizeSelection,
  parseExecutorCaller: () => parseExecutorCaller,
  selectionForChoice: () => selectionForChoice
});
module.exports = __toCommonJS(client_exports);
var React = __toESM(require("react"), 1);
var inject = ["slots", "sessions", "modelDirectories", "remote", "remote.session"];
var EXPLANATION = "Optional per-chat executor. Main / Thinker delegates bounded tasks to the Executor and reviews the results. Off uses the normal Main / Thinker flow. Main / Thinker is the model selected alongside. This setting does not change the Main model or global defaults.";
var ENDPOINT = "/api/executor.model";
var PLUGIN_ID = "dsh-executor-model";
var EXECUTOR_LABEL = /^Executor · ([^·]+?)(?: · |$)/;
function catalogModelName(groups, selection) {
  if (selection === null || selection === void 0) return "";
  for (const group of groups ?? []) {
    if (group.id !== selection.provider) continue;
    const model = group.models.find((item) => item.id === selection.model);
    if (model !== void 0) return model.name;
  }
  return selection.model;
}
function parseExecutorCaller(label) {
  const match = EXECUTOR_LABEL.exec(String(label ?? ""));
  return match === null ? null : { role: "Executor", model: match[1].trim() };
}
function findCatalogChild(catalogs, sessionId) {
  for (const catalog of Object.values(catalogs ?? {})) {
    const entry = catalog?.entries?.find((item) => item.kind === "child" && item.id === sessionId);
    if (entry !== void 0) return entry;
  }
}
function executorCallInfo(block) {
  let args;
  try {
    args = JSON.parse(block?.arguments ?? block?.argsRaw ?? block?.call?.argsRaw ?? "{}");
  } catch {
    args = {};
  }
  const description = typeof args.description === "string" ? args.description : "";
  const content = Array.isArray(block?.content) ? block.content : block?.message?.content;
  const text = Array.isArray(content) ? content.filter((item) => item?.type === "text").map((item) => item.text ?? "").join("\n") : "";
  const reported = /Executor \S+ \(([^/]+)\/([^)]+)\) reported:/.exec(text);
  return {
    description,
    provider: reported?.[1],
    model: reported?.[2],
    report: text
  };
}
function modelKey(selection) {
  return selection === null ? "" : JSON.stringify([selection.provider, selection.model]);
}
function normalizeSelection(value) {
  if (value === null) return null;
  if (typeof value !== "object" || value === null || typeof value.provider !== "string" || value.provider.length === 0 || typeof value.model !== "string" || value.model.length === 0 || value.reasoningEffort !== void 0 && (typeof value.reasoningEffort !== "string" || value.reasoningEffort.length === 0)) {
    throw new Error("The host returned an invalid executor selection.");
  }
  return Object.freeze({ provider: value.provider, model: value.model, ...value.reasoningEffort === void 0 ? {} : { reasoningEffort: value.reasoningEffort } });
}
function lowestAdvertisedEffort(model) {
  const efforts = model.reasoning?.efforts ?? [];
  for (const preferred of ["none", "off", "minimal", "low", "medium", "high", "xhigh"]) {
    const effort = efforts.find((item) => item.id.toLowerCase() === preferred);
    if (effort !== void 0) return effort.id;
  }
  if (efforts.some((item) => item.id === model.reasoning?.defaultEffort)) return model.reasoning.defaultEffort;
  return efforts[0]?.id;
}
function catalogChoices(groups) {
  return groups.flatMap((group) => group.models.map((model) => ({
    key: modelKey({ provider: group.id, model: model.id }),
    group,
    model
  })));
}
function selectionForChoice(choice, current = null) {
  const same = modelKey(current) === choice.key;
  const reasoningEffort = same ? current?.reasoningEffort : lowestAdvertisedEffort(choice.model);
  return normalizeSelection({ provider: choice.group.id, model: choice.model.id, ...reasoningEffort === void 0 ? {} : { reasoningEffort } });
}
var ExecutorSelectionController = class {
  constructor(sessionId, { fetch: fetcher = (...args) => globalThis.fetch(...args), available = true } = {}) {
    this.sessionId = sessionId;
    this.fetcher = fetcher;
    this.available = available;
    this.state = Object.freeze({ selection: null, loaded: false, status: "idle", error: null });
    this.listeners = /* @__PURE__ */ new Set();
    this.requests = /* @__PURE__ */ new Set();
    this.clock = 0;
    this.intent = 0;
    this.pendingWrites = 0;
    this.writeQueue = Promise.resolve();
    this.disposed = false;
    this.getSnapshot = () => this.state;
    this.subscribe = (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
  }
  publish(partial) {
    if (this.disposed) return;
    this.state = Object.freeze({ ...this.state, ...partial });
    for (const listener of [...this.listeners]) listener();
  }
  async request(method, selection) {
    if (this.disposed) throw new Error("Executor settings are no longer attached to this chat.");
    if (!this.available) throw new Error("Executor settings are unavailable for subagent chats.");
    const aborter = new AbortController();
    this.requests.add(aborter);
    try {
      let response;
      try {
        response = await this.fetcher(`${ENDPOINT}?sessionId=${encodeURIComponent(this.sessionId)}`, {
          method,
          credentials: "same-origin",
          cache: "no-store",
          signal: aborter.signal,
          headers: method === "POST" ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
          ...method === "POST" ? { body: JSON.stringify({ selection }) } : {}
        });
      } catch {
        throw new Error("Executor settings could not be reached. Check the connection and retry.");
      }
      if (!response.ok) throw new Error(response.status === 404 ? "Executor settings are not available for this chat. Refresh the page after installing the plugin." : response.status === 400 || response.status === 409 || response.status === 422 ? "The host rejected this executor model or effort. Refresh the model list and choose an available option." : `Executor settings request failed (HTTP ${response.status}).`);
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error("The host returned an invalid executor settings response.");
      }
      return normalizeSelection(body?.selection);
    } finally {
      this.requests.delete(aborter);
    }
  }
  load() {
    if (this.disposed || !this.available) return Promise.resolve(this.state.selection);
    if (this.pendingWrites > 0) return this.writeQueue.then(() => this.load());
    if (this.inflight !== void 0) return this.inflight;
    const clock = this.clock;
    this.publish({ status: "loading", error: null });
    const operation = this.request("GET").then((selection) => {
      if (!this.disposed && this.clock === clock) this.publish({ selection, loaded: true, status: "ready", error: null });
      return selection;
    }).catch((error) => {
      if (!this.disposed && this.clock === clock) this.publish({ status: "error", error: error.message });
      throw error;
    }).finally(() => {
      if (this.inflight === operation) this.inflight = void 0;
    });
    this.inflight = operation;
    return operation;
  }
  save(value) {
    let selection;
    try {
      selection = normalizeSelection(value);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.disposed || !this.available) return Promise.reject(new Error("Executor settings are unavailable for this chat."));
    const intent = ++this.intent;
    ++this.clock;
    ++this.pendingWrites;
    this.publish({ status: "saving", error: null });
    const operation = this.writeQueue.then(async () => {
      const clock = this.clock;
      try {
        const accepted = await this.request("POST", selection);
        if (!this.disposed && this.clock === clock && intent === this.intent) {
          ++this.clock;
          this.publish({ selection: accepted, loaded: true, error: null });
        }
        return accepted;
      } catch (error) {
        if (intent === this.intent) this.publish({ error: error.message });
        throw error;
      } finally {
        --this.pendingWrites;
        this.publish({ status: this.pendingWrites > 0 ? "saving" : this.state.error !== null ? "error" : "ready" });
      }
    });
    this.writeQueue = operation.catch(() => {
    });
    return operation;
  }
  resetConnected() {
    ++this.clock;
    this.inflight = void 0;
    return this.load();
  }
  dispose() {
    this.disposed = true;
    ++this.clock;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    this.listeners.clear();
  }
};
function installRefreshListeners(refresh, browserWindow = window, pageDocument = document) {
  const visible = () => {
    if (pageDocument.visibilityState === "visible") refresh();
  };
  browserWindow.addEventListener("focus", refresh);
  pageDocument.addEventListener("visibilitychange", visible);
  return () => {
    browserWindow.removeEventListener("focus", refresh);
    pageDocument.removeEventListener("visibilitychange", visible);
  };
}
function useStore(store) {
  const subscribe = React.useCallback((listener) => store.subscribe(listener), [store]);
  const snapshot = React.useCallback(() => store.getSnapshot(), [store]);
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}
function ExecutorModelControls({ controller, directory, available }) {
  const saved = useStore(controller);
  const catalog = useStore(directory.store);
  const explanationId = React.useId();
  const statusId = React.useId();
  const retry = React.useCallback(() => {
    controller.load().catch(() => {
    });
    if (available) directory.load().catch(() => {
    });
  }, [controller, directory, available]);
  React.useEffect(() => {
    retry();
    return installRefreshListeners(retry);
  }, [retry]);
  const choices = catalogChoices(catalog.groups);
  const key = modelKey(saved.selection);
  const chosen = choices.find((choice) => choice.key === key);
  const busy = saved.status === "saving";
  const disabled = !available || !saved.loaded || busy;
  const missing = saved.selection !== null && chosen === void 0 && catalog.status !== "loading" && catalog.status !== "idle";
  const efforts = chosen?.model.reasoning?.efforts ?? [];
  const effort = saved.selection?.reasoningEffort ?? "";
  const missingEffort = chosen !== void 0 && effort !== "" && !efforts.some((item) => item.id === effort);
  const catalogError = catalog.status === "error";
  const loading = saved.status === "loading" || catalog.status === "loading" || catalog.status === "idle";
  const message = !available ? "Executor settings are unavailable for subagent chats." : saved.error ?? (catalogError ? "The model list could not be refreshed." : missing ? "Saved executor is not in the current catalog; it may still be routable. Choose another model or Off if unavailable." : missingEffort ? "The saved effort is not advertised by this model." : catalog.failures.length > 0 ? "Some providers could not be loaded; available models are still selectable." : busy ? "Saving executor\u2026" : loading ? "Loading executor settings\u2026" : "");
  const setSelection = (selection) => {
    controller.save(selection).catch(() => {
    });
  };
  return React.createElement(
    "div",
    { className: "em-control", title: EXPLANATION, "data-executor-model": controller.sessionId },
    React.createElement(
      "label",
      { className: "em-label" },
      "Executor",
      React.createElement(
        "select",
        {
          className: "em-select",
          "aria-label": "Executor model",
          "aria-describedby": `${explanationId} ${statusId}`,
          "aria-busy": busy || loading,
          value: key,
          disabled,
          onFocus: retry,
          onPointerDown: retry,
          onChange: (event) => {
            if (event.target.value === "") {
              setSelection(null);
              return;
            }
            const choice = choices.find((item) => item.key === event.target.value);
            if (choice !== void 0) setSelection(selectionForChoice(choice, saved.selection));
          }
        },
        React.createElement("option", { value: "" }, "Off"),
        missing && React.createElement("option", { value: key }, `${saved.selection.model} (not in catalog)`),
        // Keep the saved route visible while the advisory catalog is loading.
        !missing && saved.selection !== null && chosen === void 0 && React.createElement("option", { value: key }, saved.selection.model),
        ...catalog.groups.map((group) => React.createElement(
          "optgroup",
          { key: group.id, label: group.name },
          ...choices.filter((choice) => choice.group === group).map((choice) => React.createElement("option", { key: choice.key, value: choice.key }, choice.model.name))
        ))
      )
    ),
    (efforts.length > 0 || missingEffort) && React.createElement(
      "label",
      { className: "em-label em-effort-label" },
      "Effort",
      React.createElement(
        "select",
        {
          className: "em-select em-effort",
          "aria-label": "Executor reasoning effort",
          "aria-describedby": explanationId,
          value: effort,
          disabled,
          onChange: (event) => {
            if (saved.selection === null || event.target.value !== "" && !efforts.some((item) => item.id === event.target.value)) return;
            setSelection({ provider: saved.selection.provider, model: saved.selection.model, ...event.target.value === "" ? {} : { reasoningEffort: event.target.value } });
          }
        },
        React.createElement("option", { value: "" }, "Provider default"),
        missingEffort && React.createElement("option", { value: effort }, `${effort} (not advertised)`),
        ...efforts.map((item) => React.createElement("option", { key: item.id, value: item.id }, item.name))
      )
    ),
    React.createElement("span", { id: explanationId, className: "em-sr-only" }, EXPLANATION),
    React.createElement(
      "span",
      { id: statusId, className: message && (saved.error || catalogError || missing || missingEffort || !available || catalog.failures.length > 0) ? "em-status em-warning" : "em-sr-only", role: saved.error ? "alert" : "status", "aria-live": "polite" },
      message,
      available && (saved.error || catalogError || catalog.failures.length > 0) && React.createElement("button", { type: "button", className: "em-retry", disabled: busy, onClick: retry }, "Retry")
    ),
    React.createElement("span", { className: "em-main-label", title: "Main / Thinker \u2014 the model selector immediately alongside", "aria-hidden": true }, "Main")
  );
}
function ExecutorModelSelect(props) {
  return React.createElement(ExecutorModelControls, { ...props, key: props.controller.sessionId });
}
var IDLE_SNAPSHOT = Object.freeze({ current: null, groups: [] });
var IDLE_DIRECTORY = { getSnapshot: () => IDLE_SNAPSHOT, subscribe: () => () => {
} };
function CallerChip({ sessionId, useSessions = () => void 0, directory, address }) {
  const catalog = useStore(directory?.store ?? IDLE_DIRECTORY);
  React.useEffect(() => {
    directory?.load?.().catch(() => {
    });
  }, [directory]);
  const entry = useSessions((state) => findCatalogChild(state.subagentsByParent, sessionId));
  const executor = parseExecutorCaller(entry?.label);
  const mainName = catalogModelName(catalog.groups, catalog.current);
  const role = address !== void 0 && address !== null ? "Executor" : "Main";
  const model = executor?.model || (role === "Main" ? mainName : "");
  if (model === "" && role === "Executor" && (entry?.label === void 0 || entry.label === "")) return null;
  const label = model === "" ? role : `${role} \xB7 ${model}`;
  return React.createElement("span", {
    className: "em-caller",
    title: role === "Main" ? "This chat's Main / Thinker model is calling tools and jobs." : "This agent is the optional executor. Tools and jobs here are from that model.",
    "data-executor-caller": role,
    "aria-label": `Calling model: ${label}`
  }, label);
}
function ExecutorToolCard({ block, toolName = "executor" }) {
  const info = executorCallInfo(block);
  const model = info.model ? `Executor \xB7 ${info.model}` : "Executor";
  return React.createElement(
    "div",
    { className: "em-tool", "data-executor-tool": toolName, title: EXPLANATION },
    React.createElement("span", { className: "em-tool-caller" }, model),
    React.createElement("span", { className: "em-tool-summary" }, info.description || "Delegated task")
  );
}
var CSS = `
.em-control{display:flex;align-items:center;gap:4px;position:relative;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}
.em-label{display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap}.em-main-label{margin-left:6px;white-space:nowrap}
.em-select{max-width:150px;min-width:48px;height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:2px 4px;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));cursor:pointer;text-overflow:ellipsis}
.em-select:focus-visible,.em-retry:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}.em-select:disabled{opacity:.55;cursor:default}.em-effort{max-width:100px}
.em-status{position:absolute;bottom:calc(100% + 8px);right:0;max-width:min(360px,85vw);min-width:180px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;z-index:25;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base));color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-primary));white-space:normal;box-shadow:var(--dsw-elevation-prominent)}
.em-retry{margin-left:6px;border:0;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);color:inherit;font:inherit;text-decoration:underline;cursor:pointer}
.em-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.em-caller{display:inline-flex;align-items:center;max-width:220px;min-height:28px;padding:3px 8px;border-radius:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em-tool{display:flex;flex-direction:column;gap:2px;min-width:0;padding:6px 0;font-size:13px;line-height:18px}
.em-tool-caller{color:var(--dsw-alias-label-secondary);font-size:12px}
.em-tool-summary{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:640px){.em-control{gap:2px;flex-direction:column;align-items:stretch;width:92px;flex-shrink:0}.em-label{font-size:11px;gap:2px;flex-direction:column;align-items:stretch}.em-select{max-width:92px;width:92px}.em-main-label{display:none}.em-effort-label{font-size:0;line-height:0}.em-effort{font-size:11px;max-width:92px;line-height:20px}.em-caller{max-width:120px;font-size:11px}}
`;
function apply(ctx) {
  const controllers = /* @__PURE__ */ new Map();
  ctx.effect(() => {
    if (typeof document === "undefined") return;
    const tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, "executor-model: styles");
  ctx.effect(() => () => {
    for (const controller of controllers.values()) controller.dispose();
    controllers.clear();
  }, "executor-model: session stores");
  ctx.on("connection/reset", () => {
    for (const controller of controllers.values()) controller.resetConnected().catch(() => {
    });
  });
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "executor-caller",
    order: 15,
    label: "Calling model",
    inject: (sessionId) => {
      try {
        const address = ctx.sessions.subagentAddress(sessionId);
        return {
          directory: address === void 0 ? ctx.modelDirectories.directoryFor(sessionId) : void 0,
          address
        };
      } catch {
        return { directory: void 0, address: void 0 };
      }
    }
  }, CallerChip));
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "executor",
    label: "Executor task"
  }, ExecutorToolCard));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
    name: "conversation.input.right",
    id: "executor-model",
    order: 90,
    label: "Executor model",
    inject: (sessionId) => {
      const available = ctx.sessions.subagentAddress(sessionId) === void 0;
      let controller = controllers.get(sessionId);
      if (controller === void 0) {
        const scope = ctx.sessions.scope(sessionId);
        const binding = ctx.sessions.binding(sessionId);
        if (scope === void 0 || binding === void 0) throw new Error("Executor selector requires an attached chat.");
        controller = new ExecutorSelectionController(sessionId, { available });
        controllers.set(sessionId, controller);
        const owned = controller;
        scope.effect(() => () => {
          owned.dispose();
          if (controllers.get(sessionId) === owned) controllers.delete(sessionId);
        }, "executor-model: chat scope");
      }
      return { controller, directory: ctx.modelDirectories.directoryFor(sessionId), available };
    }
  }, ExecutorModelSelect));
}
return module.exports; } });
