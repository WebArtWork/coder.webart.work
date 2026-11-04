import { Chess, validateFen } from 'chess.js';
import { passedFen } from '../analysis/enrich.ts';
import { CATEGORIES, DIFFICULTIES, SPEEDS } from '../config.ts';
import type { CandidateMove, GameRecord, TrainingPosition, Variation } from './record.ts';

/**
 * Structural and chess validation of one exported game: types and ranges, SAN/UCI agreement,
 * and every training position matching the position reached by replaying the game.
 * Returns a list of problems; empty means valid.
 */
export function validateGame(game: unknown): string[] {
	const errors: string[] = [];
	const fail = (message: string) => errors.push(message);
	if (!isObject(game)) return ['game is not an object'];
	const g = game as unknown as GameRecord;
	const where = `game ${String(g.id)}`;

	if (!isString(g.id) || !g.id) fail(`${where}: id missing`);
	for (const side of ['white', 'black'] as const) {
		const p = g[side];
		if (!isObject(p) || !isString(p.name) || !isInt(p.rating)) fail(`${where}: ${side} player invalid`);
	}
	if (!['1-0', '0-1', '1/2-1/2'].includes(g.result)) fail(`${where}: result invalid`);
	if (!isString(g.date) || !/^\d{4}-\d{2}-\d{2}/.test(g.date)) fail(`${where}: date invalid`);
	if (!isString(g.timeControl)) fail(`${where}: timeControl invalid`);
	if (!SPEEDS.includes(g.speed)) fail(`${where}: speed invalid`);
	if (g.opening !== null && !isString(g.opening)) fail(`${where}: opening invalid`);
	if (!isString(g.pgn) || !g.pgn.includes('[Site ')) fail(`${where}: pgn invalid`);
	if (!DIFFICULTIES.includes(g.difficulty)) fail(`${where}: difficulty invalid`);
	if (!isInt(g.difficultyRating)) fail(`${where}: difficultyRating invalid`);
	if (!Array.isArray(g.categories) || !g.categories.length || g.categories.some((c) => !CATEGORIES.includes(c))) {
		fail(`${where}: categories invalid`);
	}
	if (!Array.isArray(g.themes) || g.themes.some((theme) => !isString(theme))) fail(`${where}: themes invalid`);
	if (!isScore(g.qualityScore)) fail(`${where}: qualityScore out of range`);
	if (!isScore(g.uniquenessScore)) fail(`${where}: uniquenessScore out of range`);
	if (!isString(g.importedAt) || Number.isNaN(Date.parse(g.importedAt))) fail(`${where}: importedAt invalid`);
	if (!Array.isArray(g.moves) || !Array.isArray(g.uciMoves)) return [...errors, `${where}: moves missing`];
	if (g.moves.length !== g.plyCount || g.uciMoves.length !== g.plyCount) fail(`${where}: move counts disagree`);
	if (!Array.isArray(g.trainingPositions) || !g.trainingPositions.length) {
		return [...errors, `${where}: no training positions`];
	}

	// replay: SAN legal, UCI agrees, training FENs are positions of this game
	const fens = new Map<number, string>();
	const wanted = new Set([
		...g.trainingPositions.map((position) => position.ply),
		...(g.openingPositions ?? []).map((position) => position.ply),
		...(g.sacrifices ?? []).map((sacrifice) => sacrifice.ply),
	]);
	const chess = new Chess();
	for (let i = 0; i < g.moves.length; i++) {
		if (wanted.has(i)) fens.set(i, chess.fen());
		try {
			const move = chess.move(g.moves[i]);
			if (move.lan !== g.uciMoves[i]) fail(`${where}: uci ${g.uciMoves[i]} != ${move.lan} at ply ${i}`);
		} catch {
			fail(`${where}: illegal move ${g.moves[i]} at ply ${i}`);
			break;
		}
	}

	let previous = -1;
	for (const position of g.trainingPositions) {
		errors.push(...validatePosition(position, `${where} ply ${position.ply}`));
		if (position.ply <= previous) fail(`${where}: training positions not in game order`);
		previous = position.ply;
		if (fens.get(position.ply) !== position.fen) fail(`${where}: fen at ply ${position.ply} is not the game position`);
		if (position.playedMove?.uci && position.playedMove.uci !== g.uciMoves[position.ply]) {
			fail(`${where}: played move at ply ${position.ply} is not the game move`);
		}
	}
	for (const position of g.openingPositions ?? []) {
		const at = `${where} opening ply ${position.ply}`;
		if (fens.get(position.ply) !== position.fen) fail(`${at}: fen is not the game position`);
		if (position.playedMove.uci !== g.uciMoves[position.ply]) fail(`${at}: played move is not the game move`);
		if (!position.candidateMoves.length || position.candidateMoves.some((move) => !isCandidate(move) || !playable(position.fen, [move.uci]))) {
			fail(`${at}: candidate moves invalid`);
		}
	}
	for (const sacrifice of g.sacrifices ?? []) {
		const at = `${where} sacrifice ply ${sacrifice.ply}`;
		if (fens.get(sacrifice.ply) !== sacrifice.fen) fail(`${at}: fen is not the game position`);
		if (sacrifice.move.uci !== g.uciMoves[sacrifice.ply]) fail(`${at}: move is not the game move`);
		if (!['sound', 'unsound', 'unclear'].includes(sacrifice.verdict)) fail(`${at}: verdict invalid`);
		if (!sacrifice.replies.length || !sacrifice.replies.every((reply) => playable(sacrifice.fen, [sacrifice.move.uci, reply.uci]))) {
			fail(`${at}: replies invalid`);
		}
	}
	return errors;
}

function validatePosition(p: TrainingPosition, where: string): string[] {
	const errors: string[] = [];
	const fail = (message: string) => errors.push(`${where}: ${message}`);
	if (!isInt(p.ply) || p.ply < 0) fail('ply invalid');
	if (!isString(p.fen) || !validateFen(p.fen).ok) return [...errors, `${where}: fen invalid`];
	if (!CATEGORIES.includes(p.category)) fail('category invalid');
	if (!Array.isArray(p.categories) || !p.categories.includes(p.category)) fail('categories invalid');
	if (!DIFFICULTIES.includes(p.difficulty)) fail('difficulty invalid');
	if (!isScore(p.qualityScore)) fail('qualityScore out of range');
	if (!Array.isArray(p.candidateMoves) || !p.candidateMoves.length || p.candidateMoves.length > 5) {
		return [...errors, `${where}: candidateMoves must hold 1–5 moves`];
	}
	if (!Array.isArray(p.principalVariations) || p.principalVariations.length !== p.candidateMoves.length) {
		fail('principalVariations must match candidateMoves');
	}
	if (p.bestMove?.uci !== p.candidateMoves[0].uci) fail('bestMove is not the first candidate');

	const legal = new Set(new Chess(p.fen).moves({ verbose: true }).map((move) => move.lan));
	for (const move of p.candidateMoves) {
		if (!isCandidate(move)) fail('candidate move malformed');
		else if (!legal.has(move.uci)) fail(`candidate ${move.uci} is illegal`);
	}
	for (const line of p.principalVariations ?? []) {
		if (!isVariation(line)) fail('variation malformed');
		else if (!playable(p.fen, line.uci)) fail(`variation ${line.uci.join(' ')} is illegal`);
	}
	// practice fields, when enriched
	if (p.threat) {
		const passed = passedFen(p.fen);
		if (!passed || !playable(passed, p.threat.line) || !p.threat.moves.every((move) => playable(passed, [move]))) fail('threat invalid');
	}
	if (p.tempting && !playable(p.fen, [p.tempting.move.uci, ...p.tempting.refutation])) fail('tempting line is illegal');
	if (p.evalBand != null && !['white', 'equal', 'black'].includes(p.evalBand)) fail('evalBand invalid');
	return errors;
}

function playable(fen: string, uci: string[]): boolean {
	const chess = new Chess(fen);
	try {
		for (const move of uci) chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
		return true;
	} catch {
		return false;
	}
}

function isCandidate(move: CandidateMove): boolean {
	return (
		isObject(move) &&
		isString(move.san) &&
		/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.uci) &&
		(move.cp === null || isInt(move.cp)) &&
		(move.mate === null || isInt(move.mate)) &&
		(move.cp !== null || move.mate !== null) &&
		isInt(move.loss) &&
		move.loss >= 0
	);
}

function isVariation(line: Variation): boolean {
	return (
		isObject(line) &&
		Array.isArray(line.san) &&
		Array.isArray(line.uci) &&
		line.san.length === line.uci.length &&
		line.san.length > 0
	);
}

/** File-level check: an array of valid games with unique ids. */
export function validateDataset(games: unknown): string[] {
	if (!Array.isArray(games)) return ['dataset is not an array'];
	const errors: string[] = [];
	const ids = new Set<string>();
	for (const game of games) {
		errors.push(...validateGame(game));
		const id = (game as GameRecord)?.id;
		if (ids.has(id)) errors.push(`duplicate id ${id}`);
		ids.add(id);
	}
	return errors;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isInt = (value: unknown): value is number => Number.isInteger(value);
const isScore = (value: unknown) => isInt(value) && (value as number) >= 0 && (value as number) <= 100;
