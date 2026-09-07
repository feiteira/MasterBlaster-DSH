/** Durable per-chat preferences, deliberately separate from DSH's session log.
 * This installed DSH cannot append an ignorable external event; unknown required
 * events make cold session reads fail. Do not add executor events to that log.
 */
import { z } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";

const routeId = z.string().min(1).max(256).refine(
	(value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value),
	"route ids must not contain surrounding whitespace or control characters",
);
export const selectionSchema = z.object({
	provider: routeId,
	model: routeId,
	reasoningEffort: routeId.optional(),
}).strict();
export const selectionRecordSchema = z.object({ selection: selectionSchema.nullable() }).strict();
export const executorDomainSpec = defineDomain({
	name: "executor_model",
	version: 1,
	tables: { selections: domainTable(selectionRecordSchema) },
});

export class ExecutorError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = "ExecutorError";
		this.status = status;
	}
}

export function parseSelectionRecord(value) {
	const parsed = selectionRecordSchema.safeParse(value);
	if (!parsed.success) throw new ExecutorError("Expected {selection:null|{provider,model,reasoningEffort?}} with non-empty route ids.");
	return parsed.data;
}

export function isTopLevelSession(session) {
	return session?.header !== undefined
		&& session.header.origin !== "subagent"
		&& !(session.header.delegationDepth > 0);
}

export function assertTopLevelSession(session) {
	if (!isTopLevelSession(session)) throw new ExecutorError("Executor selection is available only for ordinary top-level chats.", 403);
}

/** The domain validates storage at open; every write is additionally parsed here. */
export function createExecutorState(table, llm) {
	const tails = new Map();
	const listeners = new Set();
	let closed = false;
	const read = (sessionId) => {
		const selection = table.get(sessionId)?.selection ?? null;
		return selection === null ? null : { ...selection };
	};
	return {
		read,
		watch(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		/** Serialize validation AND durability in submission order for each chat. */
		set(sessionId, value, { signal, beforeCommit } = {}) {
			const { selection } = parseSelectionRecord({ selection: value });
			if (closed) return Promise.reject(new ExecutorError("Executor settings are unloading.", 503));
			const operation = (tails.get(sessionId) ?? Promise.resolve()).then(async () => {
				if (closed) throw new ExecutorError("Executor settings are unloading.", 503);
				signal?.throwIfAborted();
				if (selection !== null) {
					try {
						// Exact adapter validation, not advisory catalog membership. This
						// neither calls selectModel nor changes the main/default model.
						await llm.resolveCallConfig({ ...selection }, signal);
					} catch (error) {
						signal?.throwIfAborted();
						throw new ExecutorError("Executor model or reasoning effort is unavailable. Check the configured provider and choose an advertised model/effort.", 422);
					}
				}
				signal?.throwIfAborted();
				if (closed) throw new ExecutorError("Executor settings are unloading.", 503);
				beforeCommit?.();
				await table.put(sessionId, { selection });
				// Notifications cannot retroactively reject a durable commit.
				for (const listener of listeners) {
					try { listener(sessionId); } catch { /* the next reconciliation retries */ }
				}
				return { selection: selection === null ? null : { ...selection } };
			});
			const tail = operation.then(() => undefined, () => undefined);
			tails.set(sessionId, tail);
			void tail.then(() => { if (tails.get(sessionId) === tail) tails.delete(sessionId); });
			return operation;
		},
		async close() {
			closed = true;
			listeners.clear();
			await Promise.all(tails.values());
		},
	};
}
