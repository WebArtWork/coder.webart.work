import type { Category, Difficulty, Speed } from '../config.ts';
import type { BoardFeatures } from '../chess/structure.ts';
import type { CandidateGame, GameAnalysis } from '../analysis/game.ts';
import { cpLoss, whiteCp, type PositionAnalysis } from '../analysis/position.ts';
import { speedOf } from '../pgn/filter.ts';

export interface Player {
	name: string;
	rating: number;
	title?: string;
}

export interface MoveRef {
	san: string;
	uci: string;
}

/** Scores are from White's point of view; `loss` is centipawns the side to move gives up vs the best move. */
export interface CandidateMove extends MoveRef {
	rank: number;
	cp: number | null;
	mate: number | null;
	loss: number;
}

export interface Variation {
	rank: number;
	cp: number | null;
	mate: number | null;
	san: string[];
	uci: string[];
}

export interface TrainingPosition {
	/** Half-moves played before this position; the move to find is `moves[ply]`. */
	ply: number;
	moveNumber: number;
	sideToMove: 'white' | 'black';
	fen: string;
	category: Category;
	categories: Category[];
	themes: string[];
	difficulty: Difficulty;
	difficultyRating: number;
	qualityScore: number;
	bestMove: MoveRef;
	/** The opponent's best answer to the best move. */
	bestReply: MoveRef | null;
	playedMove: CandidateMove & { isBest: boolean; refutation: Variation | null };
	candidateMoves: CandidateMove[];
	principalVariations: Variation[];
	/** Plies of calculation needed to see the point of the best move. */
	calculationDepth: number;
	engineDepth: number;

	// Added by `games:enrich` (and by every import since) for the practices; absent on games not enriched yet.
	/** The opponent's threat: their best move if it were their turn again; null when there is none worth showing. */
	threat?: Threat | null;
	/** Who is better in a quiet position; null when the position is not quiet or the score is borderline. */
	evalBand?: EvalBand | null;
	features?: BoardFeatures;
	/** Endgame family by the pieces left (see `endgameType`), null before the endgame. */
	endgameType?: string | null;
	/** A capture or check that looks good but loses, with how it is refuted; null when there is none. */
	tempting?: Tempting | null;
}

export type EvalBand = 'white' | 'equal' | 'black';

export interface Threat {
	/** The opponent's move, from the position with the side to move passed. */
	move: MoveRef;
	/** Every opponent move about as strong as `move` (within 50 centipawns), UCI: each counts as finding the threat. */
	moves: string[];
	/** Centipawns the opponent gains over the best move's evaluation if the threat is ignored. */
	gain: number;
	/** The threat played out, UCI from the passed position. */
	line: string[];
}

export interface Tempting {
	move: MoveRef;
	/** Centipawns it gives up against the best move. */
	loss: number;
	/** White's point of view after the move and the refutation. */
	cp: number | null;
	mate: number | null;
	/** The refutation, UCI, the opponent's reply first; plays from the position after `move`. */
	refutation: string[];
	/** Played in the game, rather than one of the engine's candidate moves. */
	played: boolean;
}

/** A position from moves 4–12 (plies 6–24) where the game move broke the opening's rules of thumb. */
export interface OpeningPosition {
	ply: number;
	fen: string;
	sideToMove: 'white' | 'black';
	/** The engine's candidate moves, best first. */
	candidateMoves: CandidateMove[];
	/** The game move: a mistake, `loss` centipawns below the best. */
	playedMove: CandidateMove;
	engineDepth: number;
}

/** A move that gave up material for at least a move, checked by the engine. */
export interface Sacrifice {
	ply: number;
	/** Before the sacrifice. */
	fen: string;
	sideToMove: 'white' | 'black';
	move: MoveRef;
	/** Material the side gave up, pawns, two plies later. */
	material: number;
	/** The best move's evaluation, White's point of view. */
	best: { uci: string; cp: number | null; mate: number | null };
	/** The sacrifice's evaluation, White's point of view, and centipawns it gives up against the best move. */
	cp: number | null;
	mate: number | null;
	loss: number;
	/** sound: the evaluation holds; unsound: the side is worse off; unclear: in between. */
	verdict: 'sound' | 'unsound' | 'unclear';
	/** The opponent's replies to the sacrifice, best first; `loss` is from the replying side. */
	replies: CandidateMove[];
	engineDepth: number;
}

export interface GameRecord {
	id: string;
	url: string;
	white: Player;
	black: Player;
	result: string;
	termination: string;
	date: string;
	timeControl: string;
	speed: Speed;
	eco: string | null;
	opening: string | null;
	pgn: string;
	/** SAN, one entry per half-move. */
	moves: string[];
	/** UCI, aligned with `moves`. */
	uciMoves: string[];
	plyCount: number;
	difficulty: Difficulty;
	difficultyRating: number;
	categories: Category[];
	themes: string[];
	qualityScore: number;
	uniquenessScore: number;
	/** When the batch that added this game started; games are kept in import order. */
	importedAt: string;
	trainingPositions: TrainingPosition[];
	/** Version of `games:enrich` the game was enriched with; absent before. */
	enriched?: number;
	openingPositions?: OpeningPosition[];
	sacrifices?: Sacrifice[];
}

export function buildRecord(game: CandidateGame, analysis: GameAnalysis, uniqueness: number, importedAt: string): GameRecord {
	const h = game.headers;
	return {
		id: game.id,
		url: `https://lichess.org/${game.id}`,
		white: player(h['White'], h['WhiteElo'], h['WhiteTitle']),
		black: player(h['Black'], h['BlackElo'], h['BlackTitle']),
		result: h['Result'],
		termination: h['Termination'] ?? '',
		date: isoDate(h),
		timeControl: h['TimeControl'],
		speed: speedOf(h['TimeControl']) as Speed,
		eco: h['ECO'] && h['ECO'] !== '?' ? h['ECO'] : null,
		opening: h['Opening'] && h['Opening'] !== '?' ? h['Opening'] : null,
		pgn: toPgn(h, game.san),
		moves: game.san,
		uciMoves: game.uci,
		plyCount: game.san.length,
		difficulty: analysis.difficulty,
		difficultyRating: analysis.difficultyRating,
		categories: analysis.categories,
		themes: analysis.themes,
		qualityScore: analysis.quality,
		uniquenessScore: uniqueness,
		importedAt,
		trainingPositions: analysis.positions.map((position) => trainingPosition(position)),
	};
}

function trainingPosition(position: PositionAnalysis): TrainingPosition {
	const side = position.sideToMove;
	const bestCp = position.lines[0].cp;
	const candidateMoves: CandidateMove[] = position.lines.slice(0, 5).map((line, i) => ({
		rank: i + 1,
		san: line.san[0],
		uci: line.uci[0],
		...whiteCp(line.cp, line.mate, side),
		loss: cpLoss(bestCp, line.cp),
	}));
	const principalVariations: Variation[] = position.lines.slice(0, 5).map((line, i) => ({
		rank: i + 1,
		...whiteCp(line.cp, line.mate, side),
		san: line.san,
		uci: line.uci,
	}));
	const best = position.lines[0];
	const played = position.played;
	const isBest = played ? played.uci === best.uci[0] : false;
	return {
		ply: position.ply,
		moveNumber: Math.floor(position.ply / 2) + 1,
		sideToMove: side === 'w' ? 'white' : 'black',
		fen: position.fen,
		category: position.category,
		categories: position.categories,
		themes: position.motifs,
		difficulty: position.difficulty,
		difficultyRating: position.difficultyRating,
		qualityScore: position.quality,
		bestMove: { san: best.san[0], uci: best.uci[0] },
		bestReply: best.san.length > 1 ? { san: best.san[1], uci: best.uci[1] } : null,
		playedMove: played
			? {
					rank: candidateMoves.find((move) => move.uci === played.uci)?.rank ?? 0,
					san: played.san,
					uci: played.uci,
					...whiteCp(played.cp, played.mate, side),
					loss: cpLoss(bestCp, played.cp),
					isBest,
					refutation:
						!isBest && played.line && played.line.san.length > 1
							? { rank: 0, ...whiteCp(played.cp, played.mate, side), san: played.line.san, uci: played.line.uci }
							: null,
				}
			: { rank: 0, san: '', uci: '', cp: null, mate: null, loss: 0, isBest: false, refutation: null },
		candidateMoves,
		principalVariations,
		calculationDepth: position.calcDepth,
		engineDepth: position.depth,
	};
}

function player(name: string | undefined, rating: string | undefined, title: string | undefined): Player {
	const result: Player = { name: name ?? '?', rating: Number(rating) || 0 };
	if (title) result.title = title;
	return result;
}

function isoDate(h: Record<string, string>): string {
	const date = (h['UTCDate'] ?? h['Date'] ?? '').replaceAll('.', '-');
	return h['UTCTime'] ? `${date}T${h['UTCTime']}Z` : date;
}

const PGN_HEADERS = [
	'Event',
	'Site',
	'Date',
	'Round',
	'White',
	'Black',
	'Result',
	'UTCDate',
	'UTCTime',
	'WhiteElo',
	'BlackElo',
	'WhiteTitle',
	'BlackTitle',
	'ECO',
	'Opening',
	'TimeControl',
	'Termination',
];

/** Headers and moves of the original game, without clock and eval comments. */
export function toPgn(h: Record<string, string>, san: string[]): string {
	const headers = PGN_HEADERS.filter((key) => h[key] !== undefined).map(
		(key) => `[${key} "${h[key].replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
	);
	const moves = san.map((move, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${move}` : move));
	return `${headers.join('\n')}\n\n${[...moves, h['Result']].join(' ')}\n`;
}
