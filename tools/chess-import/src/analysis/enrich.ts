import { Chess, type Color } from 'chess.js';
import { endgameType, piecesOf } from '../chess/board.ts';
import { replay } from '../chess/replay.ts';
import { boardFeatures, positionalThemes } from '../chess/structure.ts';
import type { EngineLine, SearchRequest } from '../engine/uci.ts';
import type {
	CandidateMove,
	EvalBand,
	GameRecord,
	OpeningPosition,
	Sacrifice,
	Tempting,
	Threat,
	TrainingPosition,
} from '../output/record.ts';
import { MATE_CP } from '../pgn/parse.ts';
import { cpLoss, whiteCp } from './position.ts';

/**
 * What the practices need beyond the training positions: board features, who is better, tempting
 * moves, the opponent's threat, opening mistakes and sacrifices. Run on every game by
 * `games:enrich` and on each new game by the import. Raise the version when the output changes, so
 * `games:enrich` redoes the games enriched before.
 */
export const ENRICH_VERSION = 1;
/** Depth of the searches added here, shallower than the import's deep pass. */
export const ENRICH_DEPTH = 12;

/** Lines best first, scores from the side to move (see `EnginePool.analyse`). */
export type Analyse = (request: SearchRequest) => Promise<EngineLine[]>;

/** Centipawns the opponent must gain by moving twice before it counts as a threat. */
const THREAT_GAIN = 150;
/** Opponent moves this close to the best threat are threats too. */
const THREAT_MARGIN = 50;
/** Plies 6–24: moves 4 to 12. */
const OPENING_FROM = 6;
const OPENING_TO = 24;
/** The opening scan only needs a rough score per position. */
const OPENING_SCAN_DEPTH = 10;
const OPENING_MISTAKE = 100;
/** A position already this lopsided is not an opening lesson any more. */
const OPENING_BALANCE = 150;
const OPENING_PER_GAME = 2;
const SACRIFICES_PER_GAME = 2;
/** A capture or check that gives up this much is a trap worth asking about. */
const TEMPTING_LOSS = 150;
const QUIET_SECOND = 40;
const EQUAL_BAND = 50;
const CLEAR_BAND = 120;
const BAND_LIMIT = 400;
const REFUTATION_PLIES = 6;

export async function enrichGame(game: GameRecord, analyse: Analyse, depth = ENRICH_DEPTH): Promise<GameRecord> {
	const trainingPositions: TrainingPosition[] = [];
	for (const position of game.trainingPositions) {
		const fixed = fixPositional(position);
		trainingPositions.push({
			...fixed,
			threat: await threatOf(position, analyse, depth),
			evalBand: evalBandOf(position),
			features: boardFeatures(position.fen),
			endgameType: endgameType(piecesOf(new Chess(position.fen))),
			tempting: temptingOf(position),
		});
	}
	const counts = new Map<string, number>();
	for (const position of trainingPositions) for (const category of position.categories) counts.set(category, (counts.get(category) ?? 0) + 1);
	return {
		...game,
		categories: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category) as GameRecord['categories'],
		themes: [...new Set(trainingPositions.flatMap((position) => position.themes.filter((theme) => !theme.startsWith('mateIn'))))],
		trainingPositions,
		enriched: ENRICH_VERSION,
		openingPositions: await openingPositionsOf(game, analyse, depth),
		sacrifices: await sacrificesOf(game, analyse, depth),
	};
}

/**
 * "Positional" only when the best move does something with the structure (outpost, open file,
 * weak pawn, passed pawn, pawn break); those themes are added. Otherwise the label goes, and a
 * position left without a category becomes a critical decision: a quiet move that matters.
 */
export function fixPositional(position: TrainingPosition): TrainingPosition {
	if (!position.categories.includes('positional')) return position;
	const themes = positionalThemes(position.fen, position.bestMove.uci);
	if (themes.length) return { ...position, themes: [...new Set([...position.themes, ...themes])] };
	const categories = position.categories.filter((category) => category !== 'positional');
	if (!categories.length) categories.push('criticalDecision');
	const category = position.category === 'positional' ? categories[0] : position.category;
	return { ...position, category, categories };
}

/** Score from the side to move's point of view, mates folded in, from a White-POV cp/mate pair. */
function sideCp(cp: number | null, mate: number | null, side: 'white' | 'black'): number {
	const white = mate !== null ? Math.sign(mate || 1) * (MATE_CP - Math.abs(mate)) : (cp ?? 0);
	return side === 'white' ? white : -white;
}

const cap = (value: number) => Math.max(-1000, Math.min(1000, value));

/** Quiet positions only: the best move is no capture or check, and the second best is about as good. */
export function evalBandOf(position: TrainingPosition): EvalBand | null {
	const [best, second] = position.candidateMoves;
	if (!best || !second || best.mate !== null || best.cp === null) return null;
	if (second.loss > QUIET_SECOND || Math.abs(best.cp) > BAND_LIMIT) return null;
	const chess = new Chess(position.fen);
	if (chess.isCheck()) return null;
	const move = chess.move({ from: best.uci.slice(0, 2), to: best.uci.slice(2, 4), promotion: best.uci[4] });
	if (move.captured || chess.isCheck()) return null;
	if (Math.abs(best.cp) <= EQUAL_BAND) return 'equal';
	if (best.cp >= CLEAR_BAND) return 'white';
	if (best.cp <= -CLEAR_BAND) return 'black';
	return null;
}

/** The game's own losing capture or check when there is one, otherwise one from the engine's candidates. */
export function temptingOf(position: TrainingPosition): Tempting | null {
	const forcing = (san: string) => san.includes('x') || san.includes('+');
	const played = position.playedMove;
	if (!played.isBest && played.loss >= TEMPTING_LOSS && forcing(played.san) && played.refutation && played.refutation.uci.length > 1) {
		return {
			move: { san: played.san, uci: played.uci },
			loss: played.loss,
			cp: played.cp,
			mate: played.mate,
			refutation: played.refutation.uci.slice(1, 1 + REFUTATION_PLIES),
			played: true,
		};
	}
	for (const [i, move] of position.candidateMoves.entries()) {
		const line = position.principalVariations[i];
		if (i === 0 || move.loss < TEMPTING_LOSS || !forcing(move.san) || !line || line.uci.length < 2) continue;
		return {
			move: { san: move.san, uci: move.uci },
			loss: move.loss,
			cp: move.cp,
			mate: move.mate,
			refutation: line.uci.slice(1, 1 + REFUTATION_PLIES),
			played: false,
		};
	}
	return null;
}

/** The position with the side to move passed, or null when that is not a legal position (in check). */
export function passedFen(fen: string): string | null {
	if (new Chess(fen).isCheck()) return null;
	const parts = fen.split(' ');
	parts[1] = parts[1] === 'w' ? 'b' : 'w';
	parts[3] = '-';
	try {
		return new Chess(parts.join(' ')).fen();
	} catch {
		return null;
	}
}

async function threatOf(position: TrainingPosition, analyse: Analyse, depth: number): Promise<Threat | null> {
	const fen = passedFen(position.fen);
	if (!fen) return null;
	const lines = (await analyse({ fen, depth, multiPv: 3 })).filter((line) => line.pv.length);
	if (!lines.length) return null;
	const best = position.candidateMoves[0];
	const gain = cap(lines[0].cp) + cap(sideCp(best.cp, best.mate, position.sideToMove));
	if (gain < THREAT_GAIN) return null;
	const san = new Chess(fen).move({ from: lines[0].pv[0].slice(0, 2), to: lines[0].pv[0].slice(2, 4), promotion: lines[0].pv[0][4] }).san;
	return {
		move: { san, uci: lines[0].pv[0] },
		moves: lines.filter((line) => cap(line.cp) >= cap(lines[0].cp) - THREAT_MARGIN).map((line) => line.pv[0]),
		gain: Math.round(gain),
		line: lines[0].pv.slice(0, 8),
	};
}

/** Candidate moves from engine lines (side-to-move scores), White's point of view, with each line's loss. */
function candidates(fen: string, lines: EngineLine[], color: Color): CandidateMove[] {
	return lines
		.filter((line) => line.pv.length)
		.map((line, i) => ({
			rank: i + 1,
			san: sanOf(fen, line.pv[0]),
			uci: line.pv[0],
			...whiteCp(line.cp, line.mate, color),
			loss: cpLoss(lines[0].cp, line.cp),
		}));
}

function sanOf(fen: string, uci: string): string {
	return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
}

/**
 * Opening mistakes: a quick scan of plies 6–24 finds moves that lost a pawn's worth or more from
 * a balanced position; the worst (up to two) get a full search with the candidate moves.
 */
async function openingPositionsOf(game: GameRecord, analyse: Analyse, depth: number): Promise<OpeningPosition[]> {
	const plies = replay(game.moves).plies;
	const last = Math.min(OPENING_TO, plies.length - 2);
	if (last < OPENING_FROM) return [];
	const scores = new Map<number, number>();
	for (let ply = OPENING_FROM; ply <= last + 1; ply++) {
		const [line] = await analyse({ fen: plies[ply].fen, depth: Math.min(OPENING_SCAN_DEPTH, depth), multiPv: 1 });
		if (line) scores.set(ply, cap(line.cp));
	}
	const mistakes: { ply: number; loss: number }[] = [];
	for (let ply = OPENING_FROM; ply <= last; ply++) {
		const before = scores.get(ply);
		const after = scores.get(ply + 1);
		if (before === undefined || after === undefined || Math.abs(before) > OPENING_BALANCE) continue;
		// the score after the move is the opponent's
		const loss = before + after;
		if (loss >= OPENING_MISTAKE) mistakes.push({ ply, loss });
	}
	const chosen = mistakes
		.sort((a, b) => b.loss - a.loss)
		.filter((mistake, i, list) => list.slice(0, i).every((other) => Math.abs(other.ply - mistake.ply) >= 2))
		.slice(0, OPENING_PER_GAME)
		.sort((a, b) => a.ply - b.ply);

	const positions: OpeningPosition[] = [];
	for (const { ply } of chosen) {
		const { fen, uci, color } = plies[ply];
		const lines = (await analyse({ fen, depth, multiPv: 5 })).filter((line) => line.pv.length);
		if (!lines.length) continue;
		const playedLine =
			lines.find((line) => line.pv[0] === uci) ?? (await analyse({ fen, depth, multiPv: 1, searchMoves: [uci] }))[0];
		if (!playedLine) continue;
		const loss = cpLoss(lines[0].cp, playedLine.cp);
		if (loss < OPENING_MISTAKE * 0.8) continue;
		const candidateMoves = candidates(fen, lines, color);
		positions.push({
			ply,
			fen,
			sideToMove: color === 'w' ? 'white' : 'black',
			candidateMoves,
			playedMove: {
				rank: candidateMoves.find((move) => move.uci === uci)?.rank ?? 0,
				san: plies[ply].san,
				uci,
				...whiteCp(playedLine.cp, playedLine.mate, color),
				loss,
			},
			engineDepth: depth,
		});
	}
	return positions;
}

/**
 * Captures and checks whose piece the opponent takes, leaving their side at least two pawns down
 * over the next four plies: not won straight back. The engine then says whether the sacrifice holds.
 */
async function sacrificesOf(game: GameRecord, analyse: Analyse, depth: number): Promise<Sacrifice[]> {
	const plies = replay(game.moves).plies;
	const found: { ply: number; material: number }[] = [];
	for (let i = 10; i + 2 < plies.length && found.length < SACRIFICES_PER_GAME; i++) {
		const sign = plies[i].color === 'w' ? 1 : -1;
		const start = plies[i - 1].material;
		// still down after the side's next two moves, so not an in-between check before a recapture
		const after = plies.slice(i + 1, i + 5).map((ply) => (ply.material - start) * sign);
		const down = Math.max(...after);
		// a capture or check whose piece the opponent takes: an offer, not a piece left hanging
		const offer = (plies[i].captured || plies[i].check) && plies[i + 1].captured && plies[i + 1].to === plies[i].to;
		if (down > -2 || !offer || found.some((other) => i - other.ply < 4)) continue;
		found.push({ ply: i, material: -Math.min(...after.slice(0, 2)) });
	}

	const sacrifices: Sacrifice[] = [];
	for (const { ply, material } of found) {
		const { fen, uci, color, san } = plies[ply];
		const [best] = (await analyse({ fen, depth, multiPv: 1 })).filter((line) => line.pv.length);
		if (!best) continue;
		const own = best.pv[0] === uci ? best : (await analyse({ fen, depth, multiPv: 1, searchMoves: [uci] }))[0];
		if (!own) continue;
		const chess = new Chess(fen);
		chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
		if (chess.isGameOver()) continue;
		const after = chess.fen();
		const replies = candidates(after, (await analyse({ fen: after, depth, multiPv: 3 })).filter((line) => line.pv.length), chess.turn());
		if (!replies.length) continue;
		const loss = cpLoss(best.cp, own.cp);
		const score = own.mate !== null ? Math.sign(own.cp) * 1000 : cap(own.cp);
		const verdict = loss <= 80 && score >= -50 ? 'sound' : score <= -150 && loss >= 150 ? 'unsound' : 'unclear';
		sacrifices.push({
			ply,
			fen,
			sideToMove: color === 'w' ? 'white' : 'black',
			move: { san, uci },
			material,
			best: { uci: best.pv[0], ...whiteCp(best.cp, best.mate, color) },
			...whiteCp(own.cp, own.mate, color),
			loss,
			verdict,
			replies,
			engineDepth: depth,
		});
	}
	return sacrifices;
}
