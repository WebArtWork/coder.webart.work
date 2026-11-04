import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { temptingOf } from './analysis/enrich.ts';
import { fenKey } from './chess/board.ts';
import type { PracticeTag } from './config.ts';
import type { GameRecord } from './output/record.ts';
import { writeAppData } from './output/app.ts';
import { writeGamesJson } from './output/write.ts';
import type { Cursor } from './pgn/reader.ts';
import { rootDir } from './paths.ts';
import { similarityTokens } from './similarity/features.ts';
import type { Selectable } from './similarity/select.ts';

export interface DatasetFiles {
	output: string;
	/** The app's copy (catalog, daily schedule, one file per game); empty = none. */
	appDir: string;
}

/** The games currently in games.json, oldest first. Refuses files in another format. */
export async function readDataset(output: string): Promise<GameRecord[]> {
	if (!existsSync(output)) return [];
	const games = JSON.parse(await readFile(output, 'utf8')) as unknown;
	if (!Array.isArray(games)) throw new Error(`${relative(output)} is not a JSON array`);
	const foreign = games.filter((game) => !Array.isArray((game as GameRecord)?.trainingPositions)).length;
	if (foreign) {
		throw new Error(
			`${relative(output)} holds ${foreign} game(s) in another format (e.g. from games:extract). ` +
				'Run "npm run games:wipe" first, or remove them by hand.',
		);
	}
	return games as GameRecord[];
}

/** Rewrites games.json with exactly these games, then the app's copy of them. */
export async function saveDataset(games: GameRecord[], files: DatasetFiles): Promise<void> {
	await writeGamesJson(games, files.output);
	if (files.appDir) await writeAppData(games, files.appDir);
}

/** Rebuilds the app's copy from games.json, e.g. after games were removed by hand. */
export async function refreshApp(files: DatasetFiles): Promise<number> {
	const games = await readDataset(files.output);
	if (files.appDir) await writeAppData(games, files.appDir);
	return games.length;
}

/** Removes the `count` oldest games (the first in the file). Returns how many were removed. */
export async function clearOldest(count: number, files: DatasetFiles): Promise<{ removed: number; left: number }> {
	const games = await readDataset(files.output);
	const removed = Math.min(count, games.length);
	await saveDataset(games.slice(removed), files);
	return { removed, left: games.length - removed };
}

/** Removes every game. Games that were imported once still never come back (see history). */
export async function wipe(files: DatasetFiles): Promise<number> {
	let count = 0;
	if (existsSync(files.output)) {
		const games = JSON.parse(await readFile(files.output, 'utf8')) as unknown;
		count = Array.isArray(games) ? games.length : 0;
	}
	await saveDataset([], files);
	return count;
}

/** What the selection needs to know about a game already in the dataset. */
export function asSelectable(game: GameRecord): Selectable {
	return {
		id: game.id,
		quality: game.qualityScore,
		difficulty: game.difficulty,
		tokens: similarityTokens(
			{ ECO: game.eco, Opening: game.opening },
			game.trainingPositions.map((position) => ({ fen: position.fen, category: position.category, motifs: position.themes })),
		),
		fens: game.trainingPositions.map((position) => fenKey(position.fen)),
		tags: recordTags(game),
	};
}

/** `practiceTags` for a game already in the dataset, from its exported positions. */
function recordTags(game: GameRecord): PracticeTag[] {
	const tags = new Set<PracticeTag>();
	for (const position of game.trainingPositions) {
		const good = position.candidateMoves.filter((move) => move.loss <= 50).length;
		if (position.categories.includes('tactics') || position.categories.includes('calculation')) tags.add('tactics');
		if (good >= 3) tags.add('candidates');
		if (good >= 2 && Math.abs(position.candidateMoves[0]?.cp ?? 0) <= 400) tags.add('quiet');
		if (position.categories.includes('endgame')) tags.add('endgame');
		if (position.themes.includes('sacrifice') || game.sacrifices?.length) tags.add('sacrifice');
		if (position.tempting ?? temptingOf(position)) tags.add('tempting');
	}
	return [...tags];
}

// ── history: where each archive was left and every game ever imported ──────────────────

export interface ArchiveProgress {
	/** Where the next batch continues reading this file. */
	cursor: Cursor | null;
	/** Archive games read from this file so far, over all batches. */
	gamesRead: number;
	/** Read to the end: later batches move on to the next archive. */
	finished: boolean;
	updatedAt: string;
}

export interface History {
	/** Per archive file name, so files can move and more months can be added. */
	archives: Record<string, ArchiveProgress>;
	/** Every game id ever added, including ones removed since: they are never imported again. */
	ids: string[];
}

type HistoryFile = Record<string, History>;

/** History is kept per output file, so samples and the real dataset don't share it. */
function historyKey(output: string): string {
	return relative(output);
}

export async function loadHistory(file: string, output: string): Promise<History> {
	if (!existsSync(file)) return { archives: {}, ids: [] };
	const all = JSON.parse(await readFile(file, 'utf8')) as HistoryFile;
	const history = all[historyKey(output)];
	return { archives: history?.archives ?? {}, ids: history?.ids ?? [] };
}

export async function saveHistory(file: string, output: string, history: History): Promise<void> {
	const all = existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as HistoryFile) : {};
	all[historyKey(output)] = history;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(`${file}.tmp`, JSON.stringify(all, null, '\t') + '\n');
	await rename(`${file}.tmp`, file);
}

/** The archive the next batch reads: the given one, or the first not fully imported. */
export function nextArchive(history: History, archives: string[]): string | null {
	return archives.find((file) => !history.archives[path.basename(file)]?.finished) ?? null;
}

function relative(file: string): string {
	return path.relative(rootDir, file).replaceAll('\\', '/');
}
