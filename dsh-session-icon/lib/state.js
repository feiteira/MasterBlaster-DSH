/** Durable per-session sidebar icons, stored outside the session log. */
import { z } from "zod";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";

/** Curated glyphs shown to the left of session titles. */
export const ICONS = Object.freeze([
	{ id: "star", glyph: "⭐", label: "Star" },
	{ id: "smile", glyph: "😊", label: "Smiley" },
	{ id: "hourglass", glyph: "⏳", label: "Sandclock" },
	{ id: "clock", glyph: "🕒", label: "Clock" },
	{ id: "fire", glyph: "🔥", label: "Fire" },
	{ id: "bulb", glyph: "💡", label: "Idea" },
	{ id: "check", glyph: "✅", label: "Done" },
	{ id: "unchecked", glyph: "☐", label: "Unchecked" },
	{ id: "question", glyph: "❓", label: "Question" },
	{ id: "info", glyph: "ℹ️", label: "Info" },
	{ id: "exclaim", glyph: "❗", label: "Important" },
	{ id: "cross", glyph: "❌", label: "Blocked" },
	{ id: "eyes", glyph: "👀", label: "Review" },
	{ id: "speech", glyph: "💬", label: "Comment" },
	{ id: "target", glyph: "🎯", label: "Focus" },
	{ id: "test", glyph: "🧪", label: "Test" },
	{ id: "package", glyph: "📦", label: "Package" },
	{ id: "link", glyph: "🔗", label: "Link" },
	{ id: "wip", glyph: "🚧", label: "WIP" },
	{ id: "green", glyph: "🟢", label: "Green" },
	{ id: "yellow", glyph: "🟡", label: "Yellow" },
	{ id: "red", glyph: "🔴", label: "Red" },
	{ id: "pin", glyph: "📌", label: "Pin" },
	{ id: "rocket", glyph: "🚀", label: "Rocket" },
	{ id: "heart", glyph: "❤️", label: "Heart" },
	{ id: "bug", glyph: "🐛", label: "Bug" },
	{ id: "memo", glyph: "📝", label: "Notes" },
	{ id: "lock", glyph: "🔒", label: "Lock" },
	{ id: "sleep", glyph: "💤", label: "Later" },
	{ id: "warning", glyph: "⚠️", label: "Warning" },
	{ id: "sparkles", glyph: "✨", label: "Sparkles" },
	{ id: "folder", glyph: "📁", label: "Folder" },
	{ id: "hammer", glyph: "🔨", label: "Build" },
	{ id: "seedling", glyph: "🌱", label: "Growth" },
]);

export const ICON_IDS = new Set(ICONS.map((icon) => icon.id));
export const ICON_BY_ID = Object.freeze(Object.fromEntries(ICONS.map((icon) => [icon.id, icon])));

export const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,160}$/u;
export const ICON_ID_RE = /^[a-z][a-z0-9_-]{0,31}$/u;
export const ICON_COLUMN_PX = 18;

export const iconRecordSchema = z.object({
	icon: z.string().regex(ICON_ID_RE),
}).strict();

export const sessionIconDomainSpec = defineDomain({
	name: "session_icon",
	version: 1,
	tables: { icons: domainTable(iconRecordSchema) },
});

export class SessionIconError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = "SessionIconError";
		this.status = status;
	}
}

export function isSessionId(value) {
	return typeof value === "string" && SESSION_ID_RE.test(value);
}

export function parseIconId(value) {
	if (value === null) return null;
	if (typeof value !== "string" || !ICON_ID_RE.test(value)) {
		throw new SessionIconError("Unknown session icon.");
	}
	return value;
}

export function parseWriteBody(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new SessionIconError("Expected {sessionId, icon}.");
	}
	if (!isSessionId(value.sessionId)) throw new SessionIconError("Missing or invalid sessionId.");
	return {
		sessionId: value.sessionId,
		icon: parseIconId(value.icon),
	};
}

/** In-memory view over the durable icon table. */
export function createIconState(table) {
	return {
		all() {
			const icons = {};
			for (const [sessionId, record] of table.entries()) icons[sessionId] = record.icon;
			return icons;
		},
		get(sessionId) {
			return table.get(sessionId)?.icon ?? null;
		},
		async set(sessionId, icon) {
			if (icon === null) {
				await table.delete(sessionId);
				return null;
			}
			await table.put(sessionId, { icon });
			return icon;
		},
	};
}
