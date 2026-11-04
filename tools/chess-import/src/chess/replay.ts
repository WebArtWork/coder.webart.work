import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { FULL_PHASE, VALUE } from './board.ts';

export interface Ply {
	san: string;
	uci: string;
	color: Color;
	piece: PieceSymbol;
	from: Square;
	to: Square;
	captured?: PieceSymbol;
	promotion?: PieceSymbol;
	check: boolean;
	/** Position before this move. */
	fen: string;
	/** White minus Black material after this move, pawns. */
	material: number;
	/** Non-pawn material left after this move. */
	phase: number;
}

export interface Replay {
	plies: Ply[];
	finalFen: string;
	checkmate: boolean;
	stalemate: boolean;
	draw: boolean;
}

/** Replays SAN moves from the start position; throws on the first illegal or ambiguous move. */
export function replay(san: string[]): Replay {
	const chess = new Chess();
	const plies: Ply[] = [];
	let material = 0;
	let phase = FULL_PHASE;
	for (let i = 0; i < san.length; i++) {
		let move;
		try {
			move = chess.move(san[i]);
		} catch {
			throw new Error(`illegal move ${san[i]} at ply ${i}`);
		}
		const sign = move.color === 'w' ? 1 : -1;
		if (move.captured) {
			material += sign * VALUE[move.captured];
			if (move.captured !== 'p') phase -= VALUE[move.captured];
		}
		if (move.promotion) {
			material += sign * (VALUE[move.promotion] - 1);
			phase += VALUE[move.promotion];
		}
		plies.push({
			san: move.san,
			uci: move.lan,
			color: move.color,
			piece: move.piece,
			from: move.from,
			to: move.to,
			captured: move.captured,
			promotion: move.promotion,
			check: move.san.includes('+') || move.san.includes('#'),
			fen: move.before,
			material,
			phase,
		});
	}
	return {
		plies,
		finalFen: chess.fen(),
		checkmate: chess.isCheckmate(),
		stalemate: chess.isStalemate(),
		draw: chess.isDraw(),
	};
}

/** Why a replayed game contradicts its own result, or null when it is consistent. */
export function inconsistency(game: Replay, result: string): string | null {
	if (game.checkmate) {
		const loser = game.plies.length % 2 === 0 ? 'w' : 'b';
		const expected = loser === 'w' ? '0-1' : '1-0';
		if (result !== expected) return 'checkmate contradicts result';
	}
	if (game.stalemate && result !== '1/2-1/2') return 'stalemate contradicts result';
	return null;
}
