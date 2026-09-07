import {
	buildContentArgv,
	buildFilesArgv,
	classifyRipgrepError,
	excludeGlobs,
	filterContained,
	globEscape,
	parseFilesList,
	parseJsonMatches,
	readSnippet,
	relativizeMatches,
	resolveRgPath,
	runRipgrep,
} from "../lib/search.js";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpath } from "node:fs/promises";

let failures = 0;
function assert(cond, label) {
	if (cond) console.log("  ok  " + label);
	else {
		failures++;
		console.log("FAIL  " + label);
	}
}

{
	assert(globEscape("a*b?.js") === "a\\*b\\?.js", "glob escape specials");
	assert(excludeGlobs(false).includes("!node_modules"), "default excludes node_modules");
	assert(!excludeGlobs(true).includes("!node_modules"), "all-files drops node_modules exclude");
}

{
	const argv = buildContentArgv({ query: "-evil", regex: false, caseSensitive: false, word: true, hidden: true, include: "*.js" });
	assert(argv.includes("-F"), "literal uses fixed-string");
	assert(argv.includes("-i"), "default case-insensitive");
	assert(argv.includes("-w"), "word flag");
	assert(argv.includes("--hidden"), "hidden flag");
	assert(argv.includes("--regexp=-evil"), "leading-dash query is not a flag");
	assert(argv.includes("--glob=*.js"), "include glob");
	assert(argv[argv.length - 2] === "--", "path behind --");
	const files = buildFilesArgv({ query: "foo*bar" });
	assert(files.includes("--files"), "files mode");
	assert(files.some((p) => p.startsWith("--glob=*foo\\*bar*")), "filename glob is escaped");
}

{
	const json = [
		JSON.stringify({ type: "begin", data: { path: { text: "a.txt" } } }),
		JSON.stringify({
			type: "match",
			data: {
				path: { text: "./a.txt" },
				line_number: 3,
				lines: { text: "hello world\n" },
				submatches: [{ start: 6, end: 11 }],
			},
		}),
		JSON.stringify({
			type: "match",
			data: {
				path: { text: "b.txt" },
				line_number: 1,
				lines: { bytes: "xxxx" },
			},
		}),
		"not-json",
	].join("\n");
	const parsed = parseJsonMatches(json, 10);
	assert(parsed.matches.length === 2, "two matches parsed");
	assert(parsed.matches[0].path === "a.txt" && parsed.matches[0].line === 3 && parsed.matches[0].column === 7, "match fields");
	assert(parsed.matches[0].text === "hello world", "newline stripped");
	assert(parsed.matches[1].text.includes("UTF-8"), "binary placeholder");
	const capped = parseJsonMatches(json, 1);
	assert(capped.matches.length === 1 && capped.truncated, "match cap truncates");
}

{
	const files = parseFilesList("src/a.ts\n../etc/passwd\n/etc/passwd\nb.ts\n", 10);
	assert(files.matches.length === 4, "files list parsed");
	const contained = filterContained(files.matches);
	assert(contained.length === 2 && contained[0].path === "src/a.ts" && contained[1].path === "b.ts", "escapes filtered");
	const rel = relativizeMatches("/ws", [{ path: "/ws/src/a.ts", line: 1, column: 1, text: "" }]);
	assert(rel.length === 1 && rel[0].path === "src/a.ts", "absolute inside root rewritten");
}

{
	assert(classifyRipgrepError({ timedOut: true }).status === 504, "timeout 504");
	assert(classifyRipgrepError({ overflow: true }).status === 413, "overflow 413");
	assert(classifyRipgrepError({ code: 2, stderr: "regex parse error: oops" }).status === 400, "bad regex 400");
	assert(classifyRipgrepError({ code: 1, stderr: "" }) === null, "exit 1 is no matches");
	assert(classifyRipgrepError({ code: 0, stderr: "" }) === null, "exit 0 ok");
}

{
	const workdir = mkdtempSync(join(tmpdir(), "dsh-fart-snip-"));
	writeFileSync(join(workdir, "n.txt"), "one\ntwo\nthree\nfour\n");
	const snippet = await readSnippet(join(workdir, "n.txt"), 2, 1);
	assert(!("error" in snippet) && snippet.line === 2, "snippet line");
	assert(snippet.lines.map((r) => r.text).join(",") === "one,two,three", "snippet context");
}

{
	const workdir = mkdtempSync(join(tmpdir(), "dsh-fart-rg-"));
	writeFileSync(join(workdir, "hit.js"), "const fartSearch = 1;\nconst other = 2;\n");
	writeFileSync(join(workdir, "miss.txt"), "nothing here\n");
	mkdirSync(join(workdir, "node_modules"));
	writeFileSync(join(workdir, "node_modules", "hit.js"), "const fartSearch = hidden;\n");
	const rgPath = await resolveRgPath();
	const argv = buildContentArgv({ query: "fartSearch", regex: false });
	const result = await runRipgrep(argv, { cwd: workdir, rgPath, timeoutMs: 8000 });
	assert(!classifyRipgrepError(result), "rg content search succeeded");
	const parsed = parseJsonMatches(result.stdout, 50);
	assert(parsed.matches.some((m) => m.path === "hit.js" && m.text.includes("fartSearch")), "found workspace hit");
	assert(!parsed.matches.some((m) => m.path.includes("node_modules")), "node_modules excluded by default");
	const files = await runRipgrep(buildFilesArgv({ query: "hit" }), { cwd: workdir, rgPath, timeoutMs: 8000 });
	const listed = parseFilesList(files.stdout, 50);
	assert(listed.matches.some((m) => m.path === "hit.js"), "filename search finds hit.js");
}

if (failures) {
	console.error(`${failures} failure(s)`);
	process.exit(1);
}
console.log("search tests passed");
