import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Non-pawn material of both sides at the start: 2 × (9 + 2·5 + 2·3 + 2·3). */
export const FULL_PHASE = 62;
/** At or below this non-pawn material a position counts as an endgame (e.g. R+B vs R+N). */
export const ENDGAME_PHASE = 20;

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export interface PieceAt {
	square: Square;
	type: PieceSymbol;
	color: Color;
}

export function piecesOf(chess: Chess): PieceAt[] {
	const pieces: PieceAt[] = [];
	for (const row of chess.board()) {
		for (const cell of row) if (cell) pieces.push({ square: cell.square, type: cell.type, color: cell.color });
	}
	return pieces;
}

/** Material of `color` minus its opponent, in pawns. */
export function balance(pieces: PieceAt[], color: Color): number {
	let total = 0;
	for (const piece of pieces) total += piece.color === color ? VALUE[piece.type] : -VALUE[piece.type];
	return total;
}

/** Non-pawn material of both sides together (62 at the start, 0 in a pawn ending). */
export function phase(pieces: PieceAt[]): number {
	let total = 0;
	for (const piece of pieces) if (piece.type !== 'p') total += VALUE[piece.type];
	return total;
}

/** Board, side to move, castling and en passant: identifies a position regardless of move counters. */
export function fenKey(fen: string): string {
	return fen.split(' ').slice(0, 4).join(' ');
}

const FILES = 'abcdefgh';

export function fileOf(square: Square): number {
	return square.charCodeAt(0) - 97;
}

export function rankOf(square: Square): number {
	return Number(square[1]) - 1;
}

export function squareAt(file: number, rank: number): Square | null {
	if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
	return `${FILES[file]}${rank + 1}` as Square;
}

export function kingSquare(pieces: PieceAt[], color: Color): Square | null {
	return pieces.find((piece) => piece.type === 'k' && piece.color === color)?.square ?? null;
}

/** Squares `attacker` hits in the defender's king zone, counted per attacking piece. */
export function kingZonePressure(chess: Chess, pieces: PieceAt[], attacker: Color): number {
	const king = kingSquare(pieces, opposite(attacker));
	if (!king) return 0;
	let pressure = 0;
	for (let df = -1; df <= 1; df++) {
		for (let dr = -1; dr <= 1; dr++) {
			const square = squareAt(fileOf(king) + df, rankOf(king) + dr);
			if (square) pressure += chess.attackers(square, attacker).length;
		}
	}
	return pressure;
}

/** Pawn-structure features used for similarity: file masks and named structures. */
export function structureTokens(pieces: PieceAt[]): string[] {
	const pawns = { w: [] as Square[], b: [] as Square[] };
	for (const piece of pieces) if (piece.type === 'p') pawns[piece.color].push(piece.square);
	const mask = (color: Color) =>
		FILES.split('')
			.map((file, i) => (pawns[color].some((square) => fileOf(square) === i) ? file : '.'))
			.join('');
	const tokens = [`pawns:${mask('w')}/${mask('b')}`];
	for (const color of ['w', 'b'] as const) {
		const files = new Set(pawns[color].map(fileOf));
		const counts = new Map<number, number>();
		for (const square of pawns[color]) counts.set(fileOf(square), (counts.get(fileOf(square)) ?? 0) + 1);
		if (files.has(3) && !files.has(2) && !files.has(4)) tokens.push('struct:iqp');
		if (files.has(2) && files.has(3) && !files.has(1) && !files.has(4)) tokens.push('struct:hangingPawns');
		if ([...counts.values()].some((count) => count > 1)) tokens.push('struct:doubled');
		const enemy = pawns[opposite(color)];
		for (const square of pawns[color]) {
			const file = fileOf(square);
			const rank = rankOf(square);
			const blocked = enemy.some(
				(other) =>
					Math.abs(fileOf(other) - file) <= 1 && (color === 'w' ? rankOf(other) > rank : rankOf(other) < rank),
			);
			if (!blocked) {
				tokens.push('struct:passed');
				break;
			}
		}
	}
	if (mask('w') === mask('b')) tokens.push('struct:symmetric');
	const whiteKing = kingSquare(pieces, 'w');
	const blackKing = kingSquare(pieces, 'b');
	if (whiteKing && blackKing) {
		const side = (square: Square) => (fileOf(square) <= 2 ? 'q' : fileOf(square) >= 5 ? 'k' : 'c');
		const [w, b] = [side(whiteKing), side(blackKing)];
		if (w !== 'c' && b !== 'c' && w !== b) tokens.push('struct:oppositeCastling');
	}
	return [...new Set(tokens)];
}

/** Material imbalance, bishop pair, opposite bishops: independent of which side has what. */
export function materialTokens(pieces: PieceAt[]): string[] {
	const count = (color: Color, type: PieceSymbol) =>
		pieces.filter((piece) => piece.color === color && piece.type === type).length;
	const extra = (color: Color) =>
		(['q', 'r', 'b', 'n'] as const)
			.map((type) => type.repeat(Math.max(0, count(color, type) - count(opposite(color), type))))
			.join('');
	const [w, b] = [extra('w'), extra('b')];
	const tokens: string[] = [];
	if (!w && !b) {
		const pawns = Math.abs(count('w', 'p') - count('b', 'p'));
		tokens.push(pawns ? `imb:pawns${Math.min(pawns, 3)}` : 'imb:equal');
	} else {
		tokens.push(`imb:${[w || '-', b || '-'].sort().join('v')}`);
	}
	const bishops = (color: Color) => pieces.filter((piece) => piece.color === color && piece.type === 'b');
	if ((bishops('w').length >= 2) !== (bishops('b').length >= 2)) tokens.push('imb:bishopPair');
	if (bishops('w').length === 1 && bishops('b').length === 1) {
		const shade = (square: Square) => (fileOf(square) + rankOf(square)) % 2;
		if (shade(bishops('w')[0].square) !== shade(bishops('b')[0].square)) tokens.push('imb:oppositeBishops');
	}
	return tokens;
}

/** Endgame family by the non-pawn pieces left, or null before the endgame. */
export function endgameType(pieces: PieceAt[]): string | null {
	if (phase(pieces) > ENDGAME_PHASE) return null;
	const types = new Set(pieces.filter((piece) => piece.type !== 'p' && piece.type !== 'k').map((piece) => piece.type));
	if (!types.size) return 'pawn';
	const has = (type: PieceSymbol) => types.has(type);
	if (has('q')) return types.size === 1 ? 'queen' : 'queenAndPieces';
	if (has('r')) return types.size === 1 ? 'rook' : 'rookAndMinor';
	if (has('b') && has('n')) return 'knightVsBishop';
	return has('b') ? 'bishop' : 'knight';
}

export function newChess(fen?: string): Chess {
	return fen ? new Chess(fen) : new Chess();
}
