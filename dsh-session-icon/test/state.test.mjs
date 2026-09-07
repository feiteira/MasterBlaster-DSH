import test from "node:test";
import assert from "node:assert/strict";
import {
	ICONS, ICON_IDS, ICON_BY_ID, isSessionId, parseIconId, parseWriteBody,
	createIconState, SessionIconError, sessionIconDomainSpec,
} from "../lib/state.js";

function memoryTable(seed = {}) {
	const records = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
	return {
		records,
		get: (id) => records.get(id),
		entries: () => records.entries(),
		async put(id, value) { records.set(id, structuredClone(value)); },
		async delete(id) { return records.delete(id); },
	};
}

test("catalog ids are unique and look up glyphs", () => {
	assert.equal(ICONS.length, ICON_IDS.size);
	assert.equal(ICON_BY_ID.star.glyph, "⭐");
	assert.equal(ICON_BY_ID.smile.glyph, "😊");
	assert.equal(ICON_BY_ID.hourglass.glyph, "⏳");
	assert.equal(ICON_BY_ID.unchecked.glyph, "☐");
	assert.equal(ICON_BY_ID.question.glyph, "❓");
	assert.equal(sessionIconDomainSpec.name, "session_icon");
});

test("session ids reject empty, spaced, and oversized values", () => {
	assert.equal(isSessionId("chat-1"), true);
	assert.equal(isSessionId("A_b-9"), true);
	assert.equal(isSessionId(""), false);
	assert.equal(isSessionId("chat 1"), false);
	assert.equal(isSessionId("x".repeat(161)), false);
	assert.equal(isSessionId(null), false);
});

test("write body accepts catalog icons and null, rejects unknown glyphs", () => {
	assert.deepEqual(parseWriteBody({ sessionId: "chat-1", icon: "star" }), { sessionId: "chat-1", icon: "star" });
	assert.deepEqual(parseWriteBody({ sessionId: "chat-1", icon: null }), { sessionId: "chat-1", icon: null });
	assert.deepEqual(parseWriteBody({ sessionId: "chat-1", icon: "unchecked" }), { sessionId: "chat-1", icon: "unchecked" });
	assert.throws(() => parseWriteBody({ sessionId: "chat-1", icon: "Nope" }), SessionIconError);
	assert.throws(() => parseWriteBody({ sessionId: "bad id", icon: "star" }), SessionIconError);
	assert.throws(() => parseWriteBody("star"), SessionIconError);
	assert.throws(() => parseIconId("⭐"), SessionIconError);
});

test("state lists, sets, and clears icons", async () => {
	const state = createIconState(memoryTable({ "chat-a": { icon: "star" } }));
	assert.deepEqual(state.all(), { "chat-a": "star" });
	assert.equal(state.get("chat-a"), "star");
	assert.equal(state.get("missing"), null);
	assert.equal(await state.set("chat-b", "smile"), "smile");
	assert.equal(await state.set("chat-a", null), null);
	assert.deepEqual(state.all(), { "chat-b": "smile" });
});
