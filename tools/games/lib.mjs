import { spawn } from 'node:child_process';
import { open, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import zlib from 'node:zlib';

const zstdDecompress = promisify(zlib.zstdDecompress);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, '../..');
export const gamesFile = path.join(rootDir, 'src/data/game/games.json');

/** Mate scores are stored as centipawns past this bound, closer mates score higher. */
export const MATE_CP = 10000;

/** `--key value` / `--flag` arguments, with defaults. */
export function parseArgs(defaults) {
	const args = { ...defaults };
	const argv = process.argv.slice(2);
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		if (!(key in defaults)) throw new Error(`Unknown option ${argv[i]}`);
		const next = argv[i + 1];
		if (typeof defaults[key] === 'boolean') {
			args[key] = next === 'false' ? (i++, false) : next === 'true' ? (i++, true) : true;
		} else {
			args[key] = typeof defaults[key] === 'number' ? Number(next) : next;
			i++;
		}
	}
	return args;
}

/** games.json keeps one game per line: compact, and a diff shows which games changed. */
export async function writeGames(file, games) {
	const tmp = `${file}.tmp`;
	await writeFile(tmp, `[\n${games.map((game) => JSON.stringify(game)).join(',\n')}\n]\n`);
	await rename(tmp, file);
}

/**
 * Text lines of a Lichess `.pgn.zst` archive. The archives are pzstd output: every zstd frame is
 * preceded by a skippable frame holding its compressed size. Frames are decoded one at a time so a
 * damaged one (e.g. a download still in progress) is skipped; `null` is yielded in its place so the
 * reader can drop the game that straddles the gap.
 */
export async function* zstdLines(file, { maxBytes = Infinity, onFrame } = {}) {
	const handle = await open(file);
	const size = Math.min((await handle.stat()).size, maxBytes);
	const header = Buffer.alloc(12);
	let offset = 0;
	let rest = '';
	try {
		while (offset + 12 <= size) {
			await handle.read(header, 0, 12, offset);
			if ((header.readUInt32LE(0) & 0xfffffff0) >>> 0 !== 0x184d2a50 || header.readUInt32LE(4) !== 4) {
				throw new Error(`Unexpected frame header at byte ${offset}, not a pzstd archive`);
			}
			const length = header.readUInt32LE(8);
			if (offset + 12 + length > size) break;
			const frame = Buffer.alloc(length);
			await handle.read(frame, 0, length, offset + 12);
			offset += 12 + length;
			onFrame?.(offset);
			let text;
			try {
				text = rest + (await zstdDecompress(frame)).toString('utf8');
			} catch (error) {
				console.warn(`\nskipping damaged frame before byte ${offset}: ${error.message}`);
				rest = '';
				yield null;
				continue;
			}
			const lines = text.split('\n');
			rest = lines.pop();
			yield* lines;
		}
		if (rest) yield rest;
	} finally {
		await handle.close();
	}
}

/** Lichess `[%eval 0.18]` / `[%eval #-3]`, white's point of view, to centipawns. */
export function parseEval(text) {
	if (text.startsWith('#')) {
		const mate = Number(text.slice(1));
		return Math.sign(mate) * (MATE_CP - Math.abs(mate));
	}
	return Math.round(Number(text) * 100);
}

/** SAN moves and per-move evals from PGN movetext. Evals are null when the game has none. */
export function parseMovetext(movetext) {
	const moves = [];
	const evals = [];
	const tokens = /\{([^}]*)\}|(\S+)/g;
	let match;
	while ((match = tokens.exec(movetext))) {
		if (match[1] !== undefined) {
			const evalMatch = match[1].match(/\[%eval ([^\]\s]+)\]/);
			if (evalMatch && moves.length) evals[moves.length - 1] = parseEval(evalMatch[1]);
			continue;
		}
		const token = match[2];
		if (/^\d+\.+$/.test(token) || /^\$\d+$/.test(token) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) continue;
		moves.push(token.replace(/[?!]+$/, ''));
	}
	const complete = evals.length >= moves.length - 1 && moves.slice(0, -1).every((_, i) => evals[i] !== undefined);
	return { moves, evals: complete ? moves.map((_, i) => evals[i] ?? null) : null };
}

/** One UCI engine process: native Stockfish binary or the npm wasm build run through node. */
export class Engine {
	constructor(enginePath) {
		const isJs = enginePath.endsWith('.js');
		this._proc = spawn(isJs ? process.execPath : enginePath, isJs ? [enginePath] : [], {
			stdio: ['pipe', 'pipe', 'ignore'],
		});
		this._buffer = '';
		this._listener = null;
		this._proc.stdout.setEncoding('utf8');
		this._proc.stdout.on('data', (data) => {
			this._buffer += data;
			let index;
			while ((index = this._buffer.indexOf('\n')) >= 0) {
				const line = this._buffer.slice(0, index).trim();
				this._buffer = this._buffer.slice(index + 1);
				this._listener?.(line);
			}
		});
	}

	send(command) {
		this._proc.stdin.write(`${command}\n`);
	}

	/** Send a command and collect output lines until one matches `done`. */
	until(command, done) {
		return new Promise((resolve) => {
			const lines = [];
			this._listener = (line) => {
				lines.push(line);
				if (done(line)) {
					this._listener = null;
					resolve(lines);
				}
			};
			this.send(command);
		});
	}

	async init(options) {
		await this.until('uci', (line) => line === 'uciok');
		for (const [name, value] of Object.entries(options)) this.send(`setoption name ${name} value ${value}`);
		await this.until('isready', (line) => line === 'readyok');
	}

	/** MultiPV search; scores are from the side to move, best line first. */
	async analyse(fen, depth, multipv) {
		this.send(`setoption name MultiPV value ${multipv}`);
		this.send(`position fen ${fen}`);
		const lines = await this.until(`go depth ${depth}`, (line) => line.startsWith('bestmove'));
		const byRank = new Map();
		for (const line of lines) {
			const match = line.match(/^info .*?\bdepth (\d+) .*?\bmultipv (\d+) .*?\bscore (cp|mate) (-?\d+).*? pv (.+)$/);
			if (!match || match[0].includes('upperbound') || match[0].includes('lowerbound')) continue;
			const [, , rank, kind, value, pv] = match;
			const score = Number(value);
			const cp = kind === 'cp' ? score : Math.sign(score || -1) * (MATE_CP - Math.abs(score));
			byRank.set(Number(rank), { cp, mate: kind === 'mate' ? score : undefined, moves: pv.split(' ') });
		}
		return [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line);
	}

	quit() {
		this.send('quit');
	}
}
