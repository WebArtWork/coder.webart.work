import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The Angular project root (`repo/`); every default path is resolved from it. */
export const rootDir = path.resolve(import.meta.dirname, '../../..');
export const toolDir = path.resolve(import.meta.dirname, '..');

export function fromRoot(relative: string): string {
	return path.resolve(rootDir, relative);
}

const ARCHIVE_NAME = /^lichess_db_.*\.pgn\.zst$/;

/**
 * Lichess monthly archives in the project root and the folder above it, oldest month first
 * (the file names sort by date).
 */
export function findArchives(): string[] {
	const found = new Map<string, string>();
	for (const dir of [rootDir, path.dirname(rootDir)]) {
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir)) if (ARCHIVE_NAME.test(name) && !found.has(name)) found.set(name, path.join(dir, name));
	}
	return [...found.keys()].sort().map((name) => found.get(name) as string);
}

/** --engine, then STOCKFISH_PATH, then a native build next to the project, then the npm wasm build. */
export function findEngine(explicit: string): string {
	if (explicit) {
		if (!existsSync(explicit)) throw new Error(`Stockfish not found at ${explicit}`);
		return path.resolve(explicit);
	}
	const candidates = [
		process.env['STOCKFISH_PATH'],
		fromRoot('../../stockfish/stockfish-windows-x86-64-universal.exe'),
		fromRoot('../../stockfish/stockfish'),
		fromRoot('node_modules/stockfish/bin/stockfish-18-single.js'),
	];
	const found = candidates.find((file) => file && existsSync(file));
	if (!found) throw new Error('No Stockfish found: pass --engine <path> or set STOCKFISH_PATH');
	return path.resolve(found);
}
