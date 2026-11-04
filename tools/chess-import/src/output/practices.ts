import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { boardFeatures, openingPrinciples, PIECE_NAMES, stalemateMoves, type BoardFeatures, type SideName } from '../chess/structure.ts';
import type { CandidateMove, GameRecord, TrainingPosition } from './record.ts';

/**
 * The practices' files in the app's copy: small, self-contained sets (no game file needed), like
 * practice.json and lookahead.json. Built from the enriched fields of games.json (see
 * `enrichGame`); games not enriched yet only feed the practices that need no engine.
 *
 *   threats.json     What's the threat?    eval.json        Who is better?
 *   features.json    Spot the feature      safe.json        Is it safe?
 *   visualize.json   See it in your head   openings.json    Opening moves
 *   sacrifices.json  Sound sacrifice?
 *
 * Every item has `id`, `game`, `ply` (for "See the game"), `fen`, `side` and `rating`. Scores are
 * from White's point of view.
 */

type Side = 'white' | 'black';

interface ItemBase {
	id: string;
	game: string;
	ply: number;
	fen: string;
	/** Side to move, or the side the board is shown from. */
	side: Side;
	rating: number;
	/** Opening family. */
	opening: string;
}

/** A move with its evaluation: `loss` is centipawns below the best, from the moving side. */
export interface ScoredMove {
	uci: string;
	san: string;
	cp: number | null;
	mate: number | null;
	loss: number;
}

export interface ThreatItem extends ItemBase {
	/** The opponent's threat, UCI from the position with the side to move passed. */
	threat: string;
	/** Every opponent move that counts as finding the threat. */
	threats: string[];
	line: string[];
	/** Moves that deal with it: the engine's moves within `GOOD_LOSS` of the best. */
	answers: string[];
	/** The best move's evaluation; other moves are checked against it in the browser. */
	cp: number | null;
	mate: number | null;
}

export type Imbalance = 'material' | 'bishopPair' | 'passedPawn' | 'pawnWeaknesses' | 'development' | 'space';

export interface EvalItem extends ItemBase {
	band: 'white' | 'equal' | 'black';
	cp: number;
	/** Imbalances on the board and who they favour, the main one first. */
	imbalances: { kind: Imbalance; side: Side; amount: number }[];
}

export type FeatureKind = 'isolated' | 'doubled' | 'backward' | 'passed' | 'outposts' | 'openFiles' | 'halfOpen';

export interface FeatureItem extends ItemBase {
	feature: FeatureKind;
	/** Whose pawns, outposts or half-open files; null for open files. */
	color: Side | null;
	/** Squares to tap; files for open and half-open files, where any square of the file counts. */
	answers: string[];
}

export interface SafeItem extends ItemBase {
	move: string;
	san: string;
	safe: boolean;
	/** Unsafe moves: the refutation, the opponent's reply first. */
	refutation: string[];
	/** After the move, with best play. */
	cp: number | null;
	mate: number | null;
	loss: number;
	/** The move was played in the game. */
	played: boolean;
}

export type VisualQuestion =
	| { kind: 'piece'; square: string; answer: string; options: string[] }
	| { kind: 'attacked'; square: string; by: Side; answer: boolean }
	| { kind: 'moves'; square: string; piece: string; answer: string[] };

export interface VisualItem extends ItemBase {
	/** Plies to play in your head, UCI and SAN, from `fen`. */
	moves: string[];
	sans: string[];
	question: VisualQuestion;
}

export interface OpeningItem extends ItemBase {
	played: ScoredMove;
	/** Good moves (within `GOOD_LOSS` of the best), UCI. */
	answers: string[];
	lines: ScoredMove[];
	/** Rules of thumb the best move follows: castle, develop, centre, material. */
	principles: string[];
	/** Average rating of the two players. */
	players: number;
}

export interface SacrificeItem extends ItemBase {
	move: string;
	san: string;
	verdict: 'sound' | 'unsound' | 'unclear';
	material: number;
	cp: number | null;
	mate: number | null;
	loss: number;
	best: { uci: string; san: string; cp: number | null; mate: number | null };
	/** The opponent's replies to the sacrifice, best first; `answers` are the good ones. */
	replies: ScoredMove[];
	answers: string[];
}

/** Moves within this many centipawns of the best are good, as in the good-moves puzzles. */
const GOOD_LOSS = 50;
const MAX_THREAT_EVAL = 300;
/** Visualize items: every other training position is plenty. */
const VISUAL_EVERY = 2;

const clampRating = (rating: number) => Math.max(500, Math.min(2200, Math.round(rating / 10) * 10));
const sideOf = (color: Color): Side => (color === 'w' ? 'white' : 'black');
const scored = (move: CandidateMove): ScoredMove => ({ uci: move.uci, san: move.san, cp: move.cp, mate: move.mate, loss: move.loss });
const good = (moves: CandidateMove[]) => moves.filter((move) => move.loss <= GOOD_LOSS).map((move) => move.uci);

function base(game: GameRecord, ply: number, fen: string, side: Side, rating: number, opening: string, suffix = ''): ItemBase {
	return { id: `${game.id}-${ply}${suffix}`, game: game.id, ply, fen, side, rating: clampRating(rating), opening };
}

export interface PracticeFiles {
	threats: ThreatItem[];
	eval: EvalItem[];
	features: FeatureItem[];
	safe: SafeItem[];
	visualize: VisualItem[];
	openings: OpeningItem[];
	sacrifices: SacrificeItem[];
}

export function practiceFiles(games: GameRecord[], openingFamily: (name: string | null) => string): PracticeFiles {
	const files: PracticeFiles = { threats: [], eval: [], features: [], safe: [], visualize: [], openings: [], sacrifices: [] };
	let count = 0;
	for (const game of games) {
		const opening = openingFamily(game.opening);
		for (const position of game.trainingPositions) {
			const threat = threatItem(game, position, opening);
			if (threat) files.threats.push(threat);
			const band = evalItem(game, position, opening);
			if (band) files.eval.push(band);
			const feature = count % 2 ? featureItem(game, position, opening, count) : null;
			if (feature) files.features.push(feature);
			files.safe.push(...safeItems(game, position, opening));
			if (count % VISUAL_EVERY === 0) {
				const visual = visualItem(game, position, opening, count);
				if (visual) files.visualize.push(visual);
			}
			count++;
		}
		for (const position of game.openingPositions ?? []) files.openings.push(openingItem(game, position, opening));
		for (const sacrifice of game.sacrifices ?? []) files.sacrifices.push(sacrificeItem(game, sacrifice, opening));
	}
	// the opening practice leans on lower-rated games: their mistakes teach the rules of thumb best
	files.openings.sort((a, b) => a.players - b.players || a.id.localeCompare(b.id));
	return files;
}

function threatItem(game: GameRecord, position: TrainingPosition, opening: string): ThreatItem | null {
	const threat = position.threat;
	const best = position.candidateMoves[0];
	if (!threat || best.mate !== null || Math.abs(best.cp ?? 0) > MAX_THREAT_EVAL) return null;
	const answers = good(position.candidateMoves);
	const quiet = !threat.move.san.includes('x') && !threat.move.san.includes('+');
	const rating = 900 + (quiet ? 250 : 0) + (answers.length === 1 ? 150 : 0) + 0.3 * (position.difficultyRating - 1200);
	return {
		...base(game, position.ply, position.fen, position.sideToMove, rating, opening),
		threat: threat.move.uci,
		threats: threat.moves,
		line: threat.line,
		answers,
		cp: best.cp,
		mate: best.mate,
	};
}

/** Material, bishop pair, passed pawns, pawn weaknesses, development and space: who has more of each. */
export function imbalancesOf(fen: string, features: BoardFeatures = boardFeatures(fen)): EvalItem['imbalances'] {
	const chess = new Chess(fen);
	const board = chess.board().flat().filter((cell) => cell !== null);
	const value: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
	const sum = (color: Color, test: (type: PieceSymbol, square: Square) => boolean) =>
		board.filter((cell) => cell.color === color && test(cell.type, cell.square)).length;
	const list: EvalItem['imbalances'] = [];
	const add = (kind: Imbalance, white: number, black: number) => {
		if (white !== black) list.push({ kind, side: white > black ? 'white' : 'black', amount: Math.abs(white - black) });
	};
	const material = (color: Color) => board.filter((cell) => cell.color === color).reduce((total, cell) => total + value[cell.type], 0);
	add('material', material('w'), material('b'));
	if (features.bishopPair) list.push({ kind: 'bishopPair', side: features.bishopPair, amount: 1 });
	add('passedPawn', features.white.passed.length, features.black.passed.length);
	const weaknesses = (side: SideName) => features[side].isolated.length + features[side].doubled.length + features[side].backward.length;
	// fewer weaknesses is the plus
	add('pawnWeaknesses', weaknesses('black'), weaknesses('white'));
	const home = (color: Color) => sum(color, (type, square) => (type === 'n' || type === 'b') && square[1] === (color === 'w' ? '1' : '8'));
	add('development', home('b'), home('w'));
	// space: pawns beyond the fourth rank, own side's view
	const space = (color: Color) => sum(color, (type, square) => type === 'p' && (color === 'w' ? Number(square[1]) >= 5 : Number(square[1]) <= 4));
	add('space', space('w'), space('b'));
	return list;
}

function evalItem(game: GameRecord, position: TrainingPosition, opening: string): EvalItem | null {
	const band = position.evalBand;
	const cp = position.candidateMoves[0].cp;
	if (!band || cp === null) return null;
	const all = imbalancesOf(position.fen, position.features);
	// the main imbalance favours the better side when one does
	const favoured = band === 'equal' ? all : [...all.filter((item) => item.side === band), ...all.filter((item) => item.side !== band)];
	const rating = 1500 - Math.min(400, Math.abs(cp)) + (band === 'equal' ? 0 : -50);
	return { ...base(game, position.ply, position.fen, position.sideToMove, rating, opening), band, cp, imbalances: favoured };
}

const FEATURE_RATING: Record<FeatureKind, number> = {
	isolated: 800,
	doubled: 750,
	passed: 900,
	openFiles: 850,
	halfOpen: 1100,
	backward: 1350,
	outposts: 1450,
};

/** One question per position, about a feature with one to three answers, picked by a stable hash. */
function featureItem(game: GameRecord, position: TrainingPosition, opening: string, seed: number): FeatureItem | null {
	const features = position.features ?? boardFeatures(position.fen);
	const options: { feature: FeatureKind; color: Side | null; answers: string[] }[] = [];
	for (const color of ['white', 'black'] as const) {
		for (const feature of ['isolated', 'doubled', 'backward', 'passed', 'outposts', 'halfOpen'] as const) {
			options.push({ feature, color, answers: features[color][feature] });
		}
	}
	options.push({ feature: 'openFiles', color: null, answers: features.openFiles });
	const usable = options.filter((option) => option.answers.length >= 1 && option.answers.length <= (option.feature === 'doubled' ? 4 : 3));
	if (!usable.length) return null;
	const pick = usable[(hash(`${game.id}-${position.ply}`) + seed) % usable.length];
	const rating = FEATURE_RATING[pick.feature] + 50 * (pick.answers.length - 1);
	// show the board from the side asked about
	const side = pick.color ?? position.sideToMove;
	return {
		...base(game, position.ply, position.fen, side, rating, opening, `-${pick.feature}-${pick.color ?? 'all'}`),
		feature: pick.feature,
		color: pick.color,
		answers: pick.answers,
	};
}

/** The tempting capture or check that loses, and the best move when it is a capture or check: safe. */
function safeItems(game: GameRecord, position: TrainingPosition, opening: string): SafeItem[] {
	const items: SafeItem[] = [];
	const tempting = position.tempting;
	if (tempting) {
		items.push({
			...base(game, position.ply, position.fen, position.sideToMove, 1000 + Math.min(400, position.difficultyRating - 900), opening, '-x'),
			move: tempting.move.uci,
			san: tempting.move.san,
			safe: false,
			refutation: tempting.refutation,
			cp: tempting.cp,
			mate: tempting.mate,
			loss: tempting.loss,
			played: tempting.played,
		});
	}
	const best = position.candidateMoves[0];
	const second = position.candidateMoves[1];
	const forcing = best.san.includes('x') || best.san.includes('+');
	// safe and clearly the move: a real point, not one of several equal captures
	if (forcing && second && second.loss >= 100 && best.mate === null) {
		items.push({
			...base(game, position.ply, position.fen, position.sideToMove, 900 + 0.4 * (position.difficultyRating - 900), opening, '-ok'),
			move: best.uci,
			san: best.san,
			safe: true,
			refutation: [],
			cp: best.cp,
			mate: best.mate,
			loss: 0,
			played: position.playedMove.uci === best.uci,
		});
	}
	return items;
}

/** Two to four plies of the game after a training position, and one question about the result. */
function visualItem(game: GameRecord, position: TrainingPosition, opening: string, seed: number): VisualItem | null {
	const h = hash(`${game.id}:${position.ply}`) + seed;
	const plies = 2 + (h % 3);
	const uci = game.uciMoves.slice(position.ply, position.ply + plies);
	if (uci.length < plies) return null;
	const chess = new Chess(position.fen);
	const sans: string[] = [];
	const touched: Square[] = [];
	for (const move of uci) {
		const played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
		sans.push(played.san);
		touched.push(played.from, played.to);
	}
	if (chess.isGameOver()) return null;
	const questions = visualQuestions(new Chess(position.fen), chess, touched);
	if (!questions.length) return null;
	const question = questions[h % questions.length];
	const kindRating = { piece: 0, attacked: 100, moves: 250 }[question.kind];
	return {
		...base(game, position.ply, position.fen, position.sideToMove, 700 + 150 * plies + kindRating, opening, '-v'),
		moves: uci,
		sans,
		question,
	};
}

const pieceCode = (cell: { color: Color; type: PieceSymbol } | null | undefined) => (cell ? `${cell.color}${cell.type}` : '-');

/** Questions only the moves played in your head answer: what stands where, what is attacked, where a piece can go. */
export function visualQuestions(start: Chess, end: Chess, touched: Square[]): VisualQuestion[] {
	const questions: VisualQuestion[] = [];
	const at = (board: Chess, square: Square) => pieceCode(board.get(square));
	// what stands on a square the moves changed
	const changed = [...new Set(touched)].filter((square) => at(start, square) !== at(end, square));
	const target = changed.at(-1);
	if (target) {
		const answer = at(end, target);
		const distractors = [...new Set([at(start, target), ...changed.map((square) => at(start, square)), ...changed.map((square) => at(end, square)), '-'])]
			.filter((code) => code !== answer)
			.slice(0, 3);
		if (distractors.length >= 2) questions.push({ kind: 'piece', square: target, answer, options: [answer, ...distractors].sort() });
	}
	// is a piece of the side to move attacked now
	const mover = end.turn();
	const own = end
		.board()
		.flat()
		.filter((cell) => cell && cell.color === mover && cell.type !== 'k' && touched.includes(cell.square));
	const enemy = mover === 'w' ? 'b' : 'w';
	for (const cell of own) {
		if (!cell) continue;
		const attacked = end.attackers(cell.square, enemy).length > 0;
		// only when the answer changed with the moves, so it cannot be read off the board
		if (attacked !== start.attackers(cell.square, enemy).length > 0 || at(start, cell.square) !== pieceCode(cell)) {
			questions.push({ kind: 'attacked', square: cell.square, by: sideOf(enemy), answer: attacked });
			break;
		}
	}
	// where the last piece the side to move moved can go
	const lastOwn = [...touched].reverse().find((square) => {
		const cell = end.get(square);
		return cell && cell.color === mover && cell.type !== 'p' && cell.type !== 'k';
	});
	if (lastOwn) {
		const answer = end.moves({ square: lastOwn, verbose: true }).map((move) => move.to as string);
		const unique = [...new Set(answer)].sort();
		if (unique.length >= 1 && unique.length <= 8) {
			questions.push({ kind: 'moves', square: lastOwn, piece: PIECE_NAMES[end.get(lastOwn)!.type], answer: unique });
		}
	}
	return questions;
}

function openingItem(game: GameRecord, position: NonNullable<GameRecord['openingPositions']>[number], opening: string): OpeningItem {
	const players = Math.round((game.white.rating + game.black.rating) / 2);
	const answers = good(position.candidateMoves);
	const rating = 0.7 * players - 100 + (answers.length === 1 ? 100 : 0);
	return {
		...base(game, position.ply, position.fen, position.sideToMove, rating, opening, '-o'),
		played: scored(position.playedMove),
		answers,
		lines: position.candidateMoves.map(scored),
		principles: openingPrinciples(position.fen, position.candidateMoves[0].uci),
		players,
	};
}

function sacrificeItem(game: GameRecord, sacrifice: NonNullable<GameRecord['sacrifices']>[number], opening: string): SacrificeItem {
	const verdictRating = { sound: 1300, unsound: 1100, unclear: 1500 }[sacrifice.verdict];
	const san = new Chess(sacrifice.fen).move({
		from: sacrifice.best.uci.slice(0, 2),
		to: sacrifice.best.uci.slice(2, 4),
		promotion: sacrifice.best.uci[4],
	}).san;
	return {
		...base(game, sacrifice.ply, sacrifice.fen, sacrifice.sideToMove, verdictRating + 50 * (sacrifice.material - 2), opening, '-s'),
		move: sacrifice.move.uci,
		san: sacrifice.move.san,
		verdict: sacrifice.verdict,
		material: sacrifice.material,
		cp: sacrifice.cp,
		mate: sacrifice.mate,
		loss: sacrifice.loss,
		best: { ...sacrifice.best, san },
		replies: sacrifice.replies.map(scored),
		answers: good(sacrifice.replies),
	};
}

/** A won position where a legal move stalemates the opponent: the trap to avoid. */
export function stalemateTrap(position: TrainingPosition): boolean {
	const best = position.candidateMoves[0];
	const white = position.sideToMove === 'white';
	const winning = best.mate !== null ? best.mate > 0 === white : (white ? 1 : -1) * (best.cp ?? 0) >= 300;
	return winning && stalemateMoves(position.fen).length > 0;
}

function hash(text: string): number {
	let value = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
	return value >>> 0;
}
