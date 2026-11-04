/**
 * Pick training positions from every game in src/data/game/games.json and analyse them with
 * Stockfish (MultiPV), filling `positions` the same way the old position pool was built.
 *
 *   node tools/games/analyze-games.mjs --workers 6
 *   node tools/games/analyze-games.mjs --engine C:/tools/stockfish.exe --workers 8 --depth 20
 *
 * Resumable: games that already have positions are skipped (use --force to redo them), and the
 * file is saved every --save-every games. A native Stockfish binary is several times faster than
 * the default wasm build.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Chess } from 'chess.js';
import { Engine, gamesFile, MATE_CP, parseArgs, rootDir, writeGames } from './lib.mjs';

const args = parseArgs({
	file: gamesFile,
	engine: path.join(rootDir, 'node_modules/stockfish/bin/stockfish-18-lite-single.js'),
	workers: 2,
	hash: 64,
	depth: 18,
	multipv: 20,
	/** Plies kept in each stored line. */
	lineLength: 10,
	/** Training positions taken from one game. */
	perGame: 3,
	/** Depth of the quick per-ply pass for games without a Lichess eval curve. */
	scanDepth: 10,
	saveEvery: 25,
	/** Analyse at most this many games this run; 0 for all. */
	limit: 0,
	force: false,
});

/** First ply a position may come from: skip the first moves of book. */
const MIN_PLY = 12;
/** Plies between two positions of the same game. */
const MIN_GAP = 8;
/** A played move that lost this much (centipawns) marks a critical moment worth training on. */
const CRITICAL_LOSS = 80;
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const games = JSON.parse(await readFile(args.file, 'utf8'));
const queue = games.filter((game) => args.force || !game.positions);
if (args.limit) queue.length = Math.min(queue.length, args.limit);
console.log(`${queue.length} of ${games.length} games to analyse`);

let done = 0;
let sinceSave = 0;
let saving = Promise.resolve();
const started = Date.now();

await Promise.all(Array.from({ length: Math.min(args.workers, queue.length) }, worker));
await save();
console.log(`\ndone: ${done} games in ${Math.round((Date.now() - started) / 1000)}s`);

async function worker() {
	const engine = new Engine(args.engine);
	await engine.init({ Hash: args.hash });
	let game;
	while ((game = queue.shift())) {
		try {
			await analyseGame(engine, game);
		} catch (error) {
			console.warn(`\n${game.id}: ${error.message}`);
			continue;
		}
		done++;
		const perGame = (Date.now() - started) / done / 1000;
		process.stdout.write(`\r${done} analysed, ${queue.length} left, ~${Math.round((perGame * queue.length) / 60)} min to go`);
		if (++sinceSave >= args.saveEvery) {
			sinceSave = 0;
			await save();
		}
	}
	engine.quit();
}

function save() {
	saving = saving.then(() => writeGames(args.file, games));
	return saving;
}

async function analyseGame(engine, game) {
	const chess = new Chess();
	const fens = [chess.fen()];
	const sans = game.moves.split(' ');
	for (const san of sans) {
		chess.move(san);
		fens.push(chess.fen());
	}
	game.evals ??= await scanEvals(engine, fens);

	const positions = [];
	for (const ply of pickPlies(game.evals, sans.length)) {
		const lines = await engine.analyse(fens[ply], args.depth, args.multipv);
		if (!lines.length) continue;
		positions.push(toPosition(game, ply, fens[ply], sans[ply], lines));
	}
	game.positions = positions;
}

/** White-POV eval after each ply, for games Lichess did not analyse. */
async function scanEvals(engine, fens) {
	const evals = [];
	for (const fen of fens.slice(1)) {
		const chess = new Chess(fen);
		const white = chess.turn() === 'w' ? 1 : -1;
		if (chess.isCheckmate()) evals.push(-white * MATE_CP);
		else if (chess.isGameOver()) evals.push(0);
		else evals.push(white * (await engine.analyse(fen, args.scanDepth, 1))[0].cp);
	}
	return evals;
}

/**
 * Plies worth training on: critical moments first (the move played there lost a lot), then quiet
 * positions spread over the game. Positions where the side to move is already lost are skipped.
 */
function pickPlies(evals, plyCount) {
	const evalBefore = (ply) => (ply === 0 ? 0 : evals[ply - 1]);
	const candidates = [];
	for (let ply = MIN_PLY; ply < plyCount; ply++) {
		const before = evalBefore(ply);
		const after = evals[ply];
		if (before == null || after == null) continue;
		const side = ply % 2 === 0 ? 1 : -1;
		const own = side * before;
		if (own < -300 || own > 400) continue;
		candidates.push({ ply, loss: Math.max(0, side * (before - after)) });
	}

	const picked = [];
	const take = (candidate) => {
		if (picked.length >= args.perGame) return;
		if (picked.some((ply) => Math.abs(ply - candidate.ply) < MIN_GAP)) return;
		picked.push(candidate.ply);
	};
	candidates
		.filter((candidate) => candidate.loss >= CRITICAL_LOSS)
		.sort((a, b) => b.loss - a.loss)
		.forEach(take);
	const quiet = candidates.filter((candidate) => candidate.loss < CRITICAL_LOSS);
	const step = quiet.length / (args.perGame + 1);
	for (let i = 1; i <= args.perGame; i++) {
		const candidate = quiet[Math.floor(step * i)];
		if (candidate) take(candidate);
	}
	return picked.sort((a, b) => a - b);
}

function toPosition(game, ply, fen, played, lines) {
	const chess = new Chess(fen);
	const side = chess.turn() === 'w' ? 'white' : 'black';
	const best = lines[0];
	const gap = lines.length > 1 ? best.cp - lines[1].cp : Infinity;
	const close = lines.filter((line) => best.cp - line.cp <= 50).length;
	const bestMove = chess.move(best.moves[0]);
	chess.undo();
	const sideSign = side === 'white' ? 1 : -1;
	const before = game.evals[ply - 1];
	const after = game.evals[ply];

	const complexity = [];
	if (close >= 4) complexity.push('rich');
	if (close >= 8) complexity.push('balanced');
	if (gap >= 75) complexity.push('sharp');
	if (bestMove.isCapture() || bestMove.san.includes('+')) complexity.push('active');

	return {
		id: `${game.id}-${ply}`,
		ply,
		fen,
		move_number: Number(fen.split(' ')[5]),
		side_to_move: side,
		/** The move played in the game, and how much it lost by the game's eval curve. */
		played,
		loss: before != null && after != null ? Math.max(0, sideSign * (before - after)) : null,
		phase: phaseOf(chess),
		category: Math.abs(best.cp) > 300 ? 'crushing' : gap >= 75 ? 'complex' : Math.abs(best.cp) >= 100 ? 'dominant' : 'balanced',
		balance: balanceOf(best.cp),
		complexity,
		tactics: tacticsOf(chess, best, bestMove),
		pvs: lines.map((line) => ({
			best_move: line.moves[0],
			cp: line.cp,
			...(line.mate !== undefined && { mate: line.mate }),
			line: line.moves.slice(0, args.lineLength).join(' '),
		})),
	};
}

function pieces(chess) {
	return chess.board().flat().filter(Boolean);
}

function phaseOf(chess) {
	const officers = pieces(chess).filter((piece) => piece.type !== 'p' && piece.type !== 'k').length;
	if (officers <= 6) return 'endgame';
	if (officers >= 12 && chess.moveNumber() <= 15) return 'opening';
	return 'middlegame';
}

/** Side-to-move centipawns, as the old pool was tagged. */
function balanceOf(cp) {
	if (cp > 300) return 'winning';
	if (cp >= 100) return 'better';
	if (cp > -100) return 'equal';
	if (cp >= -300) return 'worse';
	return 'losing';
}

/** Cheap board-level themes. Motifs like forks and pins need a puzzle tagger and are not guessed. */
function tacticsOf(chess, best, bestMove) {
	const tactics = new Set();
	const color = chess.turn();
	if (bestMove.isKingsideCastle() || bestMove.isQueensideCastle()) tactics.add('castling');
	if (bestMove.isEnPassant()) tactics.add('enPassant');
	const toRank = Number(bestMove.to[1]);
	if (bestMove.piece === 'p' && (color === 'w' ? toRank >= 6 : toRank <= 3)) tactics.add('advancedPawn');

	const material = (board) =>
		pieces(board).reduce((sum, piece) => sum + (piece.color === color ? 1 : -1) * PIECE_VALUES[piece.type], 0);
	const start = material(chess);
	const line = new Chess(chess.fen());
	let lowest = start;
	for (const move of best.moves.slice(0, 5)) {
		const made = line.move(move);
		if (made.isPromotion()) tactics.add('promotion');
		lowest = Math.min(lowest, material(line));
	}
	// gives up at least a minor piece on the way and still stands fine
	if (start - lowest >= 3 && material(line) < start && best.cp > -50) tactics.add('sacrifice');

	if (phaseOf(chess) === 'endgame') {
		const types = new Set(pieces(chess).map((piece) => piece.type).filter((type) => type !== 'p' && type !== 'k'));
		const only = types.size === 1 ? [...types][0] : types.size === 0 ? 'p' : null;
		const names = { r: 'rookEndgame', q: 'queenEndgame', b: 'bishopEndgame', n: 'knightEndgame', p: 'pawnEndgame' };
		if (only) tactics.add(names[only]);
	}
	return [...tactics];
}
