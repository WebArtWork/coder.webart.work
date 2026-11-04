import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Chess, type Move } from 'chess.js';
import type { LookAheadMove } from '../analysis/lookahead.ts';
import { endgameType, piecesOf } from '../chess/board.ts';
import { boardFeatures, endgameGroup, structureTags } from '../chess/structure.ts';
import { practiceFiles, stalemateTrap, type PracticeFiles } from './practices.ts';
import type { GameRecord, TrainingPosition } from './record.ts';

/**
 * The app's copy of the dataset, served at /game/ (see angular.json):
 *
 *   catalog.json   every game and puzzle in brief, plus filter counts: lists, filters, random picks
 *   daily.json     date → puzzle id, stable for past days
 *   practice.json  self-contained mate sets: every mate in 1 and mate in 3 found in the games
 *   lookahead.json Look Ahead trees, built separately by `games:lookahead` and kept across rebuilds
 *   threats.json, eval.json, features.json, safe.json, visualize.json, openings.json, sacrifices.json
 *                  one set per practice (see practices.ts)
 *   g/<id>.json    one game: moves and its puzzles with engine lines (~1 KB gzipped)
 *
 * Engine lines are stored once, in UCI; the app derives SAN with chess.js.
 */

export type PuzzleMode = 'best' | 'candidates' | 'line';

export interface AppLine {
	/** Space-separated UCI moves, the first one being the candidate move. */
	uci: string;
	/** White's point of view. */
	cp: number | null;
	mate: number | null;
}

export interface AppPuzzle {
	ply: number;
	fen: string;
	side: 'white' | 'black';
	mode: PuzzleMode;
	/** best: 1; candidates: how many good moves to find; line: your moves in the solution. */
	target: number;
	category: string;
	categories: string[];
	themes: string[];
	level: string;
	rating: number;
	quality: number;
	/** line mode: the solution, plies from `fen` (yours and the forced replies). */
	solution: string[];
	/** Engine's candidate moves, best first. */
	lines: AppLine[];
	/** The move played in the game; `line` shows how it is answered. */
	played: AppLine;
}

export interface AppGame {
	id: string;
	url: string;
	white: { name: string; rating: number; title?: string };
	black: { name: string; rating: number; title?: string };
	result: string;
	termination: string;
	date: string;
	timeControl: string;
	speed: string;
	eco: string | null;
	opening: string | null;
	/** SAN, space-separated. */
	moves: string;
	level: string;
	rating: number;
	categories: string[];
	themes: string[];
	quality: number;
	puzzles: AppPuzzle[];
}

export interface CatalogGame {
	id: string;
	white: string;
	whiteRating: number;
	black: string;
	blackRating: number;
	result: string;
	date: string;
	speed: string;
	opening: string | null;
	plies: number;
	level: string;
	rating: number;
	categories: string[];
	themes: string[];
	quality: number;
	/** Ids of this game's puzzles, in game order. */
	puzzles: string[];
	/** Verdicts of the sacrifices played in the game (see `Sacrifice`). */
	sacrifices: string[];
}

export interface CatalogPuzzle {
	/** `<gameId>-<ply>`. */
	id: string;
	game: string;
	ply: number;
	fen: string;
	side: 'white' | 'black';
	mode: PuzzleMode;
	target: number;
	category: string;
	categories: string[];
	themes: string[];
	level: string;
	rating: number;
	/** Opening family, e.g. "Sicilian Defense". */
	opening: string;
	/** Named pawn structures and bishops on the board (see `structureTags`). */
	structure: string[];
	/** pawn, rook, minor, queen or mixed; null before the endgame. */
	endgame: string | null;
}

export type FacetKey = 'category' | 'theme' | 'level' | 'mode' | 'side' | 'opening' | 'structure' | 'endgame' | 'sacrifice';

export interface Catalog {
	version: string;
	games: CatalogGame[];
	puzzles: CatalogPuzzle[];
	/** How many puzzles carry each value, for filter chips; `sacrifice` counts games. */
	facets: Record<FacetKey, Record<string, number>>;
}

/** A mate puzzle that needs no game file: the position and one correct move (other mates count too). */
export interface MateItem {
	/** `<gameId>-<ply>`. */
	id: string;
	game: string;
	ply: number;
	fen: string;
	side: 'white' | 'black';
	/** A winning move in UCI; for mate-in-1 sets any mating move is accepted. */
	move: string;
	/** Mate in more than one: the whole line in UCI, defender's replies included, `move` first. */
	line?: string[];
	rating: number;
	opening: string;
}

export interface PracticeSets {
	mate1: MateItem[];
	mate3: MateItem[];
}

/** A Look Ahead position: find the paths through its tree of good moves. Needs no game file. */
export interface LookAheadItem {
	/** `<gameId>-<ply>`, like the puzzle it comes from. */
	id: string;
	game: string;
	ply: number;
	fen: string;
	side: 'white' | 'black';
	rating: number;
	level: string;
	opening: string;
	/** Leaves of `tree`. */
	paths: number;
	tree: LookAheadMove[];
}

/** Days ahead the daily schedule is planned. */
const DAILY_DAYS = 400;
/** Target puzzle rating per weekday (0 = Sunday): easier early in the week, harder at the end. */
const DAILY_RATING = [1200, 900, 1050, 1150, 1250, 1350, 1450];
/** Moves within this many centipawns of the best count as good in candidate-move puzzles. */
export const GOOD_LOSS = 50;
/** Good moves a position needs to become a "find the good moves" puzzle (the Play page uses only these). */
export const MIN_GOOD_MOVES = 3;
export const LOOK_AHEAD_FILE = 'lookahead.json';
/** One file per practice, in the app's copy. */
export const PRACTICE_FILES: Record<keyof PracticeFiles, string> = {
	threats: 'threats.json',
	eval: 'eval.json',
	features: 'features.json',
	safe: 'safe.json',
	visualize: 'visualize.json',
	openings: 'openings.json',
	sacrifices: 'sacrifices.json',
};

export function puzzleId(game: string, ply: number): string {
	return `${game}-${ply}`;
}

export function openingFamily(name: string | null): string {
	return (name ?? '').split(':')[0].trim() || 'Unknown opening';
}

/** Which exercise fits a position: find the best move, find the good moves, or play the line. */
export function exercise(position: TrainingPosition): { mode: PuzzleMode; target: number; solution: string[] } {
	const best = position.principalVariations[0]?.uci ?? [];
	const good = position.candidateMoves.filter((move) => move.loss <= GOOD_LOSS).length;
	if (good >= MIN_GOOD_MOVES) {
		return { mode: 'candidates', target: Math.min(good, position.candidateMoves.length), solution: [] };
	}
	const depth = position.calculationDepth;
	const tactical = position.categories.includes('calculation') || position.categories.includes('tactics');
	if (tactical && depth >= 3 && best.length >= depth) {
		const solution = best.slice(0, depth % 2 ? depth : depth + 1);
		return { mode: 'line', target: Math.ceil(solution.length / 2), solution };
	}
	return { mode: 'best', target: 1, solution: [] };
}

export function appGame(game: GameRecord): AppGame {
	return {
		id: game.id,
		url: game.url,
		white: game.white,
		black: game.black,
		result: game.result,
		termination: game.termination,
		date: game.date,
		timeControl: game.timeControl,
		speed: game.speed,
		eco: game.eco,
		opening: game.opening,
		moves: game.moves.join(' '),
		level: game.difficulty,
		rating: game.difficultyRating,
		categories: game.categories,
		themes: game.themes,
		quality: game.qualityScore,
		puzzles: game.trainingPositions.map((position) => {
			const { mode, target, solution } = exercise(position);
			return {
				ply: position.ply,
				fen: position.fen,
				side: position.sideToMove,
				mode,
				target,
				category: position.category,
				categories: position.categories,
				themes: stalemateTrap(position) ? [...position.themes, 'stalemateTrap'] : position.themes,
				level: position.difficulty,
				rating: position.difficultyRating,
				quality: position.qualityScore,
				solution,
				lines: position.principalVariations.map((line) => ({ uci: line.uci.join(' '), cp: line.cp, mate: line.mate })),
				played: {
					uci: [position.playedMove.uci, ...(position.playedMove.refutation?.uci.slice(1) ?? [])].join(' '),
					cp: position.playedMove.cp,
					mate: position.playedMove.mate,
				},
			};
		}),
	};
}

/** Per game id, what the catalog takes from games.json beyond the app's game files. */
export interface CatalogExtras {
	sacrifices: string[];
	/** Per puzzle ply. */
	positions: Map<number, { structure: string[]; endgame: string | null }>;
}

export function catalogExtras(game: GameRecord): CatalogExtras {
	return {
		sacrifices: [...new Set((game.sacrifices ?? []).map((sacrifice) => sacrifice.verdict))].sort(),
		positions: new Map(
			game.trainingPositions.map((position) => [
				position.ply,
				{
					structure: structureTags(position.features ?? boardFeatures(position.fen)),
					// board facts: computed here for games not enriched yet
					endgame: endgameGroup(position.endgameType !== undefined ? position.endgameType : endgameType(piecesOf(new Chess(position.fen)))),
				},
			]),
		),
	};
}

export function buildCatalog(games: AppGame[], version: string, extras = new Map<string, CatalogExtras>()): Catalog {
	const facets: Catalog['facets'] = { category: {}, theme: {}, level: {}, mode: {}, side: {}, opening: {}, structure: {}, endgame: {}, sacrifice: {} };
	const count = (facet: keyof Catalog['facets'], value: string) => (facets[facet][value] = (facets[facet][value] ?? 0) + 1);
	const puzzles: CatalogPuzzle[] = [];
	for (const game of games) {
		const opening = openingFamily(game.opening);
		const extra = extras.get(game.id);
		for (const sacrifice of extra?.sacrifices ?? []) count('sacrifice', sacrifice);
		for (const puzzle of game.puzzles) {
			const { structure, endgame } = extra?.positions.get(puzzle.ply) ?? { structure: [], endgame: null };
			puzzles.push({
				id: puzzleId(game.id, puzzle.ply),
				game: game.id,
				ply: puzzle.ply,
				fen: puzzle.fen,
				side: puzzle.side,
				mode: puzzle.mode,
				target: puzzle.target,
				category: puzzle.category,
				categories: puzzle.categories,
				themes: puzzle.themes,
				level: puzzle.level,
				rating: puzzle.rating,
				opening,
				structure,
				endgame,
			});
			for (const category of puzzle.categories) count('category', category);
			for (const tag of structure) count('structure', tag);
			if (endgame) count('endgame', endgame);
			for (const theme of puzzle.themes) if (!theme.startsWith('mateIn')) count('theme', theme);
			count('level', puzzle.level);
			count('mode', puzzle.mode);
			count('side', puzzle.side);
			count('opening', opening);
		}
	}
	return {
		version,
		games: games.map((game) => ({
			id: game.id,
			white: game.white.name,
			whiteRating: game.white.rating,
			black: game.black.name,
			blackRating: game.black.rating,
			result: game.result,
			date: game.date,
			speed: game.speed,
			opening: game.opening,
			plies: game.moves ? game.moves.split(' ').length : 0,
			level: game.level,
			rating: game.rating,
			categories: game.categories,
			themes: game.themes,
			quality: game.quality,
			puzzles: game.puzzles.map((puzzle) => puzzleId(game.id, puzzle.ply)),
			sacrifices: extras.get(game.id)?.sacrifices ?? [],
		})),
		puzzles,
		facets,
	};
}

/**
 * Every mate in 1 in the games: the move before a checkmate that ended the game, and training
 * positions whose best line mates at once. Rated by how many other checks compete with the mate,
 * whether it is a quiet piece move, and how unusual the mating piece is.
 */
export function mateInOne(games: GameRecord[]): MateItem[] {
	const items = new Map<string, MateItem>();
	const add = (game: GameRecord, ply: number, fen: string, move: string) => {
		const id = puzzleId(game.id, ply);
		if (items.has(id)) return;
		const chess = new Chess(fen);
		const moves = chess.moves({ verbose: true });
		const mates = moves.filter((candidate) => candidate.san.endsWith('#'));
		const mate = mates.find((candidate) => candidate.lan === move);
		if (!mate) return;
		const otherChecks = moves.filter((candidate) => candidate.san.endsWith('+')).length;
		let rating = 500 + 45 * Math.min(otherChecks, 8);
		if (!mate.captured) rating += 80;
		if (mate.piece === 'n' || mate.piece === 'b' || mate.piece === 'p') rating += 100;
		if (mate.promotion) rating += 80;
		rating -= 50 * (mates.length - 1);
		items.set(id, {
			id,
			game: game.id,
			ply,
			fen,
			side: chess.turn() === 'w' ? 'white' : 'black',
			move,
			rating: Math.max(400, Math.min(1200, Math.round(rating / 10) * 10)),
			opening: openingFamily(game.opening),
		});
	};
	for (const game of games) {
		for (const position of game.trainingPositions) {
			const best = position.principalVariations[0];
			if (best && best.mate !== null && Math.abs(best.mate) === 1) add(game, position.ply, position.fen, best.uci[0]);
		}
		if (game.moves.at(-1)?.endsWith('#')) {
			const chess = new Chess();
			for (const san of game.moves.slice(0, -1)) chess.move(san);
			add(game, game.moves.length - 1, chess.fen(), game.uciMoves.at(-1) as string);
		}
	}
	return [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Plies of a mate in 3: your three moves and the two replies between them. */
const MATE3_PLIES = 5;

/**
 * Every forced mate in 3 in the engine lines: training positions whose best line mates in three,
 * and the point where a longer mating line has three moves left (`ply` stays at the game position
 * the line starts from, so "See the game" still finds it). Positions where a second move also
 * mates that fast are skipped: the practice accepts only the line or an immediate mate. Rated by how
 * quiet the first move is and which piece makes it.
 */
export function mateInThree(games: GameRecord[]): MateItem[] {
	const items = new Map<string, MateItem>();
	for (const game of games) {
		for (const position of game.trainingPositions) {
			const [best, second] = position.principalVariations;
			if (!best || best.mate === null || Math.abs(best.mate) < 3) continue;
			if (second?.mate != null && Math.sign(second.mate) === Math.sign(best.mate) && Math.abs(second.mate) <= Math.abs(best.mate)) continue;
			const skip = 2 * (Math.abs(best.mate) - 3);
			const line = best.uci.slice(skip, skip + MATE3_PLIES);
			if (line.length < MATE3_PLIES) continue;
			const chess = new Chess(position.fen);
			try {
				for (const uci of best.uci.slice(0, skip)) playUci(chess, uci);
			} catch {
				continue;
			}
			const fen = chess.fen();
			const id = puzzleId(game.id, position.ply + skip);
			if (items.has(id)) continue;
			const rating = mateInThreeRating(fen, line);
			if (rating === null) continue;
			items.set(id, {
				id,
				game: game.id,
				ply: position.ply,
				fen,
				side: chess.turn() === 'w' ? 'white' : 'black',
				move: line[0],
				line,
				rating,
				opening: openingFamily(game.opening),
			});
		}
	}
	return [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Null when the line does not end in mate. */
function mateInThreeRating(fen: string, line: string[]): number | null {
	const chess = new Chess(fen);
	const moves: Move[] = [];
	try {
		for (const uci of line) moves.push(playUci(chess, uci));
	} catch {
		return null;
	}
	if (!chess.isCheckmate()) return null;
	const [first, , second] = moves;
	let rating = 1300;
	if (!first.san.includes('+')) rating += 150;
	if (!first.captured) rating += 80;
	if (first.piece === 'q') rating -= 80;
	if (first.piece === 'n' || first.piece === 'b' || first.piece === 'p') rating += 60;
	if (!second.san.includes('+')) rating += 80;
	if (first.promotion || second.promotion) rating += 60;
	return Math.max(1000, Math.min(1900, Math.round(rating / 10) * 10));
}

function playUci(chess: Chess, uci: string) {
	return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/**
 * Date → puzzle id. Past days keep their puzzle (even if its game was removed since); today and
 * later keep theirs while the puzzle exists. Open days get an unused puzzle near the weekday's
 * target rating, picked deterministically from the date.
 */
export function planDaily(previous: Record<string, string>, puzzles: CatalogPuzzle[], today: string): Record<string, string> {
	// the daily puzzle is a Play puzzle: find the good moves
	puzzles = puzzles.filter((puzzle) => puzzle.mode === 'candidates');
	const exists = new Set(puzzles.map((puzzle) => puzzle.id));
	const schedule: Record<string, string> = {};
	for (const [date, id] of Object.entries(previous)) {
		if (date < today || exists.has(id)) schedule[date] = id;
	}
	if (!puzzles.length) return schedule;

	const used = new Map<string, string>(); // puzzle id → last date
	for (const [date, id] of Object.entries(schedule)) if ((used.get(id) ?? '') < date) used.set(id, date);

	const day = new Date(`${today}T00:00:00Z`);
	for (let i = 0; i < DAILY_DAYS; i++, day.setUTCDate(day.getUTCDate() + 1)) {
		const date = day.toISOString().slice(0, 10);
		if (schedule[date]) continue;
		const target = DAILY_RATING[day.getUTCDay()];
		const seed = hash(date);
		// unused first, then the longest unused; closest rating; the date breaks ties
		const pick = [...puzzles].sort(
			(a, b) =>
				(used.get(a.id) ?? '').localeCompare(used.get(b.id) ?? '') ||
				Math.abs(a.rating - target) - Math.abs(b.rating - target) ||
				(hash(a.id) ^ seed) - (hash(b.id) ^ seed),
		)[0];
		schedule[date] = pick.id;
		used.set(pick.id, date);
	}
	return Object.fromEntries(Object.entries(schedule).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Writes the app files for `games` into `dir` (src/data/game/app): staged, then swapped in, so
 * the app never sees a half-written set.
 */
export async function writeAppData(games: GameRecord[], dir: string, today = new Date().toISOString().slice(0, 10)): Promise<Catalog> {
	const staging = `${dir}.staging-${process.pid}`;
	await rm(staging, { recursive: true, force: true });
	await mkdir(path.join(staging, 'g'), { recursive: true });

	const appGames = games.map(appGame);
	for (const game of appGames) await writeFile(path.join(staging, 'g', `${game.id}.json`), JSON.stringify(game));
	const extras = new Map(games.map((game) => [game.id, catalogExtras(game)]));
	const catalog = buildCatalog(appGames, new Date().toISOString(), extras);
	await writeFile(path.join(staging, 'catalog.json'), JSON.stringify(catalog));
	const practice: PracticeSets = { mate1: mateInOne(games), mate3: mateInThree(games) };
	await writeFile(path.join(staging, 'practice.json'), JSON.stringify(practice));
	const sets = practiceFiles(games, openingFamily);
	for (const [name, items] of Object.entries(sets) as [keyof PracticeFiles, unknown[]][]) {
		await writeFile(path.join(staging, PRACTICE_FILES[name]), JSON.stringify(items));
	}

	// Look Ahead trees take long to build: keep the ones whose game is still here
	const lookAheadFile = path.join(dir, LOOK_AHEAD_FILE);
	if (existsSync(lookAheadFile)) {
		const ids = new Set(games.map((game) => game.id));
		const items = JSON.parse(await readFile(lookAheadFile, 'utf8')) as LookAheadItem[];
		await writeFile(path.join(staging, LOOK_AHEAD_FILE), JSON.stringify(items.filter((item) => ids.has(item.game))));
	}

	const dailyFile = path.join(dir, 'daily.json');
	const previous = existsSync(dailyFile) ? (JSON.parse(await readFile(dailyFile, 'utf8')) as Record<string, string>) : {};
	await writeFile(path.join(staging, 'daily.json'), JSON.stringify(planDaily(previous, catalog.puzzles, today), null, '\t') + '\n');

	const old = `${dir}.old-${process.pid}`;
	try {
		if (existsSync(dir)) await rename(dir, old);
		await rename(staging, dir);
	} catch (error) {
		// on Windows a folder that a dev server or an editor has open cannot be renamed: put everything back
		await rm(staging, { recursive: true, force: true });
		if (existsSync(old) && !existsSync(dir)) await rename(old, dir);
		throw new Error(
			`Could not replace ${dir} (${(error as Error).message}). Stop "npm start" or whatever has it open, then run this again; nothing was changed.`,
		);
	}
	await rm(old, { recursive: true, force: true });
	return catalog;
}

function hash(text: string): number {
	let value = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
	return value >>> 0;
}
