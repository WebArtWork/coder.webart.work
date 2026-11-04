import { Chess } from 'chess.js';
import { MoveCategory, Side, TopMove } from './chess.interface';

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function isValidFen(fen: string): boolean {
	try {
		new Chess(fen);
		return true;
	} catch {
		return false;
	}
}

export function isBlackToMove(fen: string): boolean {
	return fen.includes(' b ');
}

export function sideToMove(fen: string): Side {
	return isBlackToMove(fen) ? 'black' : 'white';
}

/** Whether a UCI move is from→to; a missing promotion piece counts as a queen. */
export function sameMove(uci: string, from: string, to: string, promotion?: string): boolean {
	return uci.slice(0, 4) === `${from}${to}` && (uci[4] ?? 'q') === (promotion ?? 'q');
}

export function formatEval(value: number | undefined | null): string {
	if (value === undefined || value === null) return '-';
	if (value >= 9000) return `M${10000 - Math.round(value)}`;
	if (value <= -9000) return `-M${10000 - Math.round(-value)}`;
	return (value > 0 ? '+' : '') + value.toFixed(2);
}

export function mateScore(mateIn: number): number {
	return mateIn > 0 ? 10000 - Math.abs(mateIn) : -(10000 - Math.abs(mateIn));
}

export function evalToWinPercent(evalScore: number): number {
	return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * evalScore * 100)) - 1);
}

export function getMoveCategory(
	positionEval: number,
	moveEval: number,
	isBlack: boolean,
	bestEval: number | null = null,
): MoveCategory {
	const sign = isBlack ? -1 : 1;
	const drop = evalToWinPercent(sign * positionEval) - evalToWinPercent(sign * moveEval);

	if (bestEval !== null && moveEval === bestEval)
		return { label: 'Best', icon: '★', color: '#22c55e' };
	if (drop < 1) return { label: 'Excellent', icon: '✦', color: '#84cc16' };
	if (drop < 3) return { label: 'Good', icon: '✓', color: '#a3e635' };
	if (drop < 7) return { label: 'Inaccuracy', icon: '?!', color: '#facc15' };
	if (drop < 15) return { label: 'Mistake', icon: '?', color: '#f97316' };
	return { label: 'Blunder', icon: '??', color: '#ef4444' };
}

/** Converts a UCI move list to SAN, stopping at the first illegal move. */
export function uciToSans(fen: string, uciMoves: string[]): string[] {
	const sans: string[] = [];
	try {
		const game = new Chess(fen);
		for (const uci of uciMoves) {
			const move = game.move({
				from: uci.slice(0, 2),
				to: uci.slice(2, 4),
				promotion: uci[4] ?? 'q',
			});
			if (!move) break;
			sans.push(move.san);
		}
	} catch {
		/* stop at the first illegal move */
	}
	return sans;
}

/** Fills category and diffs for a ranked move list (evals are white-POV pawns). */
export function enrichTopMoves(fen: string, moves: TopMove[], positionEval: number): TopMove[] {
	const isBlack = isBlackToMove(fen);
	const bestEval = moves[0]?.rawEval ?? 0;
	return moves.map((move) => ({
		...move,
		diffBest: move.rawEval - bestEval,
		diffPos: move.rawEval - positionEval,
		category: getMoveCategory(positionEval, move.rawEval, isBlack, bestEval),
	}));
}

export function parsePgn(
	pgn: string,
): { initialFen: string; moves: { san: string; fenAfter: string }[] } | null {
	try {
		const game = new Chess();
		game.loadPgn(pgn);
		const sans = game.history();
		if (!sans.length) return null;

		const fenMatch = pgn.match(/\[FEN "([^"]+)"\]/i);
		const replay = fenMatch ? new Chess(fenMatch[1]) : new Chess();
		const initialFen = replay.fen();
		const moves = sans.map((san) => {
			replay.move(san);
			return { san, fenAfter: replay.fen() };
		});
		return { initialFen, moves };
	} catch {
		return null;
	}
}
