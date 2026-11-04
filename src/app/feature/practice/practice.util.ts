import { Chess } from 'chess.js';
import { BoardMove } from '../../components/board/board.component';
import { mateScore } from '../chess/chess.util';
import { EngineService } from '../chess/engine.service';

/** Depth of the browser engine when a move is not among the stored answers. */
const CHECK_GO = 'go depth 12';
/** Pawns a move may lose against the best one and still count. */
const TOLERANCE = 0.6;

/** UCI of a board move. */
export function uciOf(move: BoardMove): string {
	return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** The position after `uci`, with the move for the board's last-move highlight; null when illegal. */
export function play(fen: string, uci: string): { fen: string; san: string; from: string; to: string } | null {
	try {
		const chess = new Chess(fen);
		const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
		return { fen: chess.fen(), san: move.san, from: move.from, to: move.to };
	} catch {
		return null;
	}
}

export function sanOf(fen: string, uci: string): string {
	return play(fen, uci)?.san ?? uci;
}

/** The position with the side to move passed, so the opponent can show what they threaten. */
export function passedFen(fen: string): string {
	const parts = fen.split(' ');
	parts[1] = parts[1] === 'w' ? 'b' : 'w';
	parts[3] = '-';
	return parts.join(' ');
}

/** The line in SAN with move numbers, e.g. "17. Nf3 Nc6 18. Bb5" or "17... Nf6 18. e5". */
export function formatLine(fen: string, ucis: string[]): string {
	const [, turn, , , , fullmove] = fen.split(' ');
	let number = Number(fullmove) || 1;
	let white = turn === 'w';
	const chess = new Chess(fen);
	const parts: string[] = [];
	for (const [i, uci] of ucis.entries()) {
		let san: string;
		try {
			san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
		} catch {
			break;
		}
		if (white) parts.push(`${number}. ${san}`);
		else parts.push(i === 0 ? `${number}... ${san}` : san);
		if (!white) number++;
		white = !white;
	}
	return parts.join(' ');
}

/** A stored score (White's point of view, cp or mate) in pawns. */
export function pawns(cp: number | null, mate: number | null): number {
	return mate !== null ? mateScore(mate) : (cp ?? 0) / 100;
}

/**
 * Whether `uci` is a good move from `fen`: one of `answers`, or, when the best score is known, a move
 * the browser engine rates within a little over half a pawn of it.
 */
export async function isGoodMove(
	engine: EngineService,
	fen: string,
	uci: string,
	answers: string[],
	best: { cp: number | null; mate: number | null } | null,
): Promise<boolean> {
	if (answers.some((answer) => answer.slice(0, 4) === uci.slice(0, 4) && (answer[4] ?? 'q') === (uci[4] ?? 'q'))) return true;
	if (!best || !play(fen, uci)) return false;
	const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
	const { eval: score } = await engine.evaluateMove(fen, uci, CHECK_GO);
	return sign * score >= sign * pawns(best.cp, best.mate) - TOLERANCE;
}
