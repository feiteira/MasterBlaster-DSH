/**
 * Streaming ZIP writer (deflate + data descriptors). No extra dependencies.
 * Writes to any Node writable (HTTP response, file, PassThrough).
 * @module
 */
import { createReadStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32, createDeflateRaw } from "node:zlib";

const LOCAL_SIG = 0x04034b50;
const DESC_SIG = 0x08074b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const UTF8_AND_DESCRIPTOR = 0x0808;
const UTF8_ONLY = 0x0800;

function dosDateTime(date) {
	const d = date instanceof Date ? date : new Date(date ?? Date.now());
	if (Number.isNaN(d.getTime())) return { time: 0, date: 0 };
	const time = ((d.getSeconds() / 2) | 0) | (d.getMinutes() << 5) | (d.getHours() << 11);
	const day = d.getDate() | ((d.getMonth() + 1) << 5) | ((d.getFullYear() - 1980) << 9);
	return { time: time & 0xffff, date: day & 0xffff };
}

function writeChunk(dest, buf) {
	return new Promise((resolve, reject) => {
		if (dest.destroyed || dest.writableEnded) {
			reject(Object.assign(new Error("aborted"), { aborted: true }));
			return;
		}
		if (dest.write(buf)) resolve();
		else dest.once("drain", resolve);
	});
}

/**
 * Stream a collected zip entry list onto `dest` and leave the destination
 * open (`end` is the caller's job, so HTTP can still set trailers / end).
 * @param dest - writable stream.
 * @param entries - `{ type, path?, name, mtime }` from collectZipEntries.
 * @returns `{ files, bytesWritten }`.
 */
export async function writeZip(dest, entries) {
	const central = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBuf = Buffer.from(entry.name, "utf8");
		if (nameBuf.length > 0xffff) continue;
		const { time, date } = dosDateTime(entry.mtime);
		const localOffset = offset;
		if (entry.type === "dir") {
			const header = Buffer.alloc(30);
			header.writeUInt32LE(LOCAL_SIG, 0);
			header.writeUInt16LE(20, 4);
			header.writeUInt16LE(UTF8_ONLY, 6);
			header.writeUInt16LE(0, 8);
			header.writeUInt16LE(time, 10);
			header.writeUInt16LE(date, 12);
			header.writeUInt16LE(nameBuf.length, 26);
			await writeChunk(dest, header);
			await writeChunk(dest, nameBuf);
			offset += 30 + nameBuf.length;
			central.push({ nameBuf, crc: 0, csize: 0, usize: 0, method: 0, flag: UTF8_ONLY, time, date, localOffset, dir: true });
			continue;
		}

		const header = Buffer.alloc(30);
		header.writeUInt32LE(LOCAL_SIG, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(UTF8_AND_DESCRIPTOR, 6);
		header.writeUInt16LE(8, 8);
		header.writeUInt16LE(time, 10);
		header.writeUInt16LE(date, 12);
		header.writeUInt16LE(nameBuf.length, 26);
		await writeChunk(dest, header);
		await writeChunk(dest, nameBuf);
		offset += 30 + nameBuf.length;

		const uncompressed = new Transform({
			transform(chunk, _enc, cb) {
				this.bytes += chunk.length;
				this.crc = crc32(chunk, this.crc);
				cb(null, chunk);
			},
		});
		uncompressed.bytes = 0;
		uncompressed.crc = 0;
		const compressed = new Transform({
			transform(chunk, _enc, cb) {
				this.bytes += chunk.length;
				cb(null, chunk);
			},
		});
		compressed.bytes = 0;
		const deflator = createDeflateRaw({ level: 6 });
		await pipeline(createReadStream(entry.path), uncompressed, deflator, compressed, dest, { end: false });
		offset += compressed.bytes;

		const desc = Buffer.alloc(16);
		desc.writeUInt32LE(DESC_SIG, 0);
		desc.writeUInt32LE(uncompressed.crc >>> 0, 4);
		desc.writeUInt32LE(compressed.bytes >>> 0, 8);
		desc.writeUInt32LE(uncompressed.bytes >>> 0, 12);
		await writeChunk(dest, desc);
		offset += 16;

		central.push({
			nameBuf,
			crc: uncompressed.crc >>> 0,
			csize: compressed.bytes >>> 0,
			usize: uncompressed.bytes >>> 0,
			method: 8,
			flag: UTF8_AND_DESCRIPTOR,
			time,
			date,
			localOffset,
			dir: false,
		});
	}

	const cdStart = offset;
	for (const rec of central) {
		const buf = Buffer.alloc(46);
		buf.writeUInt32LE(CENTRAL_SIG, 0);
		buf.writeUInt16LE(20, 4);
		buf.writeUInt16LE(20, 6);
		buf.writeUInt16LE(rec.flag, 8);
		buf.writeUInt16LE(rec.method, 10);
		buf.writeUInt16LE(rec.time, 12);
		buf.writeUInt16LE(rec.date, 14);
		buf.writeUInt32LE(rec.crc, 16);
		buf.writeUInt32LE(rec.csize, 20);
		buf.writeUInt32LE(rec.usize, 24);
		buf.writeUInt16LE(rec.nameBuf.length, 28);
		buf.writeUInt32LE(rec.dir ? 0x10 : 0, 38);
		buf.writeUInt32LE(rec.localOffset >>> 0, 42);
		await writeChunk(dest, buf);
		await writeChunk(dest, rec.nameBuf);
		offset += 46 + rec.nameBuf.length;
	}
	const cdSize = offset - cdStart;
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(EOCD_SIG, 0);
	eocd.writeUInt16LE(central.length, 8);
	eocd.writeUInt16LE(central.length, 10);
	eocd.writeUInt32LE(cdSize >>> 0, 12);
	eocd.writeUInt32LE(cdStart >>> 0, 16);
	await writeChunk(dest, eocd);
	return { files: central.length, bytesWritten: offset + 22 };
}
