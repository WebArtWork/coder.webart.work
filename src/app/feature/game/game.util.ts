import { Chess } from 'chess.js';
import { TopMove } from '../chess/chess.interface';
import { enrichTopMoves, mateScore, STARTING_FEN, uciToSans } from '../chess/chess.util';
import { EngineLine } from './game.interface';

export interface ReplayMove {
	san: string;
	uci: string;
	from: string;
	to: string;
	/** Position after this move. */
	fen: string;
}

export interface Replay {
	/** `fens[i]` is the position after `i` half-moves; `fens[0]` is the start. */
	fens: string[];
	moves: ReplayMove[];
}

/** Every position of a game, from its SAN moves. Stops at the first illegal move. */
export function replayGame(moves: string): Replay {
	const chess = new Chess();
	const replay: Replay = { fens: [STARTING_FEN], moves: [] };
	for (const san of moves.split(' ').filter(Boolean)) {
		try {
			const move = chess.move(san);
			const fen = chess.fen();
			replay.moves.push({ san: move.san, uci: move.lan, from: move.from, to: move.to, fen });
			replay.fens.push(fen);
		} catch {
			break;
		}
	}
	return replay;
}

/** Score of a stored line in pawns, White's point of view; mates use the app's mate scale. */
export function lineEval(line: EngineLine): number {
	return line.mate !== null ? mateScore(line.mate) : (line.cp ?? 0) / 100;
}

/** Ranked moves from stored engine lines, ready for `Analysis`. */
export function topMovesFromLines(fen: string, lines: EngineLine[]): TopMove[] {
	const moves: TopMove[] = lines.map((line) => {
		const uci = line.uci.split(' ').filter(Boolean);
		const sans = uciToSans(fen, uci);
		return {
			move: uci[0],
			san: sans[0] ?? uci[0],
			rawEval: lineEval(line),
			diffBest: 0,
			diffPos: 0,
			category: null,
			line: { moves: uci, sans },
		};
	});
	return enrichTopMoves(fen, moves, moves[0]?.rawEval ?? 0);
}
