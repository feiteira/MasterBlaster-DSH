import test from "node:test";
import assert from "node:assert/strict";
import { apply, name } from "../lib/index.js";

test("host half is a pure UI plugin with no host behavior", async () => {
	assert.equal(name, "workspace-tabs");
	await assert.doesNotReject(apply());
});
