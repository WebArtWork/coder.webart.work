import { createReadStream } from 'node:fs';
import { open, stat, type FileHandle } from 'node:fs/promises';
import { promisify } from 'node:util';
import { createZstdDecompress, zstdDecompress } from 'node:zlib';

const unzstd = promisify(zstdDecompress);

/**
 * A resumable position in the archive. For Lichess (pzstd) archives `frame` is the byte offset of
 * a compressed frame and `pos` an offset inside its decompressed data; for plain PGN and
 * single-stream zstd files `frame` is 0 and `pos` the offset in the (decompressed) text.
 */
export interface Cursor {
	frame: number;
	pos: number;
}

export interface RawGame {
	text: string;
	/** Where this game starts. */
	start: Cursor;
	/** Where the next game starts: resume from here once this game is handled. */
	end: Cursor;
}

export interface ReadStats {
	/** Compressed bytes consumed so far. */
	bytesRead: number;
	totalBytes: number;
}

interface Segment {
	frame: number;
	base: number;
	data: Buffer;
}

const SKIPPABLE = 0x184d2a50;
const ZSTD = 0xfd2fb528;
const GAME_START = Buffer.from('[Event ');
const LINE_GAME_START = Buffer.from('\n[Event ');

/**
 * Streams games out of a .pgn.zst / .pgn file without holding more than one decompressed frame
 * (32 MB for Lichess archives) in memory.
 */
export async function* readGames(
	file: string,
	from: Cursor = { frame: 0, pos: 0 },
	stats: ReadStats = { bytesRead: 0, totalBytes: 0 },
): AsyncGenerator<RawGame> {
	stats.totalBytes = (await stat(file)).size;
	const segments = await openSegments(file, from, stats);

	let buffer: Buffer = Buffer.alloc(0);
	let spans: { frame: number; base: number; length: number }[] = [];

	const cursorAt = (index: number): Cursor => {
		let offset = 0;
		for (let i = 0; i < spans.length; i++) {
			const span = spans[i];
			if (index < offset + span.length || i === spans.length - 1) {
				return { frame: span.frame, pos: span.base + (index - offset) };
			}
			offset += span.length;
		}
		return { ...from };
	};

	const drop = (count: number) => {
		buffer = buffer.subarray(count);
		while (spans.length && count >= spans[0].length && spans.length > 1) {
			count -= spans[0].length;
			spans.shift();
		}
		if (spans.length) {
			spans[0] = { ...spans[0], base: spans[0].base + count, length: spans[0].length - count };
		}
	};

	for await (const segment of segments) {
		if (!segment.data.length) continue;
		buffer = buffer.length ? Buffer.concat([buffer, segment.data]) : segment.data;
		spans.push({ frame: segment.frame, base: segment.base, length: segment.data.length });

		let start = firstGameStart(buffer);
		if (start < 0) continue;
		if (start > 0) {
			drop(start);
			start = 0;
		}
		for (;;) {
			const next = buffer.indexOf(LINE_GAME_START, start + 1);
			if (next < 0) break;
			const end = next + 1;
			yield { text: buffer.toString('utf8', start, end), start: cursorAt(start), end: cursorAt(end) };
			start = end;
		}
		drop(start);
	}
	if (buffer.length && firstGameStart(buffer) === 0) {
		yield { text: buffer.toString('utf8'), start: cursorAt(0), end: cursorAt(buffer.length) };
	}
}

function firstGameStart(buffer: Buffer): number {
	if (buffer.subarray(0, GAME_START.length).equals(GAME_START)) return 0;
	const index = buffer.indexOf(LINE_GAME_START);
	return index < 0 ? -1 : index + 1;
}

async function openSegments(file: string, from: Cursor, stats: ReadStats): Promise<AsyncIterable<Segment>> {
	const handle = await open(file, 'r');
	const head = Buffer.alloc(4);
	await handle.read(head, 0, 4, 0);
	const magic = head.readUInt32LE(0);
	if ((magic & 0xfffffff0) >>> 0 === SKIPPABLE) return pzstdSegments(handle, from, stats);
	await handle.close();
	if (magic === ZSTD) return streamSegments(file, 0, from.pos, stats);
	return textSegments(file, from.pos, stats);
}

interface Frame {
	frame: number;
	next: number;
	data: Promise<Buffer>;
}

/**
 * Lichess archives are pzstd output: every zstd frame is preceded by a skippable frame holding
 * its compressed size. Frames are decompressed one ahead so reading overlaps with parsing.
 */
async function* pzstdSegments(handle: FileHandle, from: Cursor, stats: ReadStats): AsyncGenerator<Segment> {
	const size = stats.totalBytes;
	const head = Buffer.alloc(12);

	const readFrame = async (at: number): Promise<Frame | 'stream' | null> => {
		while (at + 12 <= size) {
			await handle.read(head, 0, 12, at);
			const magic = head.readUInt32LE(0);
			if ((magic & 0xfffffff0) >>> 0 !== SKIPPABLE) return 'stream';
			const length = head.readUInt32LE(4);
			if (length !== 4) {
				at += 8 + length;
				continue;
			}
			const compressed = head.readUInt32LE(8);
			const body = Buffer.allocUnsafe(compressed);
			const { bytesRead } = await handle.read(body, 0, compressed, at + 12);
			const next = at + 12 + compressed;
			const data =
				bytesRead < compressed
					? Promise.reject(new Error('truncated frame at end of archive'))
					: unzstd(body).then((out) => {
							stats.bytesRead = Math.max(stats.bytesRead, next);
							return out;
						});
			data.catch(() => undefined);
			return { frame: at, next, data };
		}
		return null;
	};

	try {
		let current = await readFrame(from.frame);
		let skip = from.pos;
		while (current && current !== 'stream') {
			const upcoming = readFrame(current.next);
			let data: Buffer;
			try {
				data = await current.data;
			} catch (error) {
				console.warn(`\nzstd: ${(error as Error).message}, stopping here`);
				return;
			}
			yield { frame: current.frame, base: skip, data: skip ? data.subarray(skip) : data };
			skip = 0;
			current = await upcoming;
		}
		if (current === 'stream') {
			throw new Error('archive mixes pzstd and plain zstd frames; recompress it with pzstd or zstd');
		}
	} finally {
		await handle.close();
	}
}

/** A single-stream .zst: decompress from the start and discard the bytes before `skip`. */
async function* streamSegments(file: string, at: number, skip: number, stats: ReadStats): AsyncGenerator<Segment> {
	const input = createReadStream(file, { start: at });
	const zstd = createZstdDecompress();
	input.pipe(zstd);
	let pos = 0;
	try {
		for await (const chunk of zstd as AsyncIterable<Buffer>) {
			stats.bytesRead = at + input.bytesRead;
			if (pos + chunk.length <= skip) {
				pos += chunk.length;
				continue;
			}
			const offset = Math.max(0, skip - pos);
			yield { frame: at, base: pos + offset, data: chunk.subarray(offset) };
			pos += chunk.length;
		}
	} catch (error) {
		console.warn(`\nzstd: ${(error as Error).message}, stopping here`);
	} finally {
		input.destroy();
	}
}

async function* textSegments(file: string, at: number, stats: ReadStats): AsyncGenerator<Segment> {
	const input = createReadStream(file, { start: at, highWaterMark: 1 << 22 });
	let pos = at;
	for await (const chunk of input as AsyncIterable<Buffer>) {
		yield { frame: 0, base: pos, data: chunk };
		pos += chunk.length;
		stats.bytesRead = pos;
	}
}
