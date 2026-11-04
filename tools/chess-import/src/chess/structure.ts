import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { fileOf, opposite, piecesOf, rankOf, squareAt, type PieceAt } from './board.ts';

/**
 * Board facts for the practices: pawn weaknesses, outposts, files, bishops. Computed from the
 * position alone, no engine, so an answer built on them is right by construction.
 */

export type SideName = 'white' | 'black';

export interface SideFeatures {
	/** Pawn squares. */
	isolated: string[];
	/** Every pawn on a file holding two or more of this side's pawns. */
	doubled: string[];
	backward: string[];
	passed: string[];
	/** Squares in the opponent's half no enemy pawn can ever attack, guarded by one of this side's pawns. */
	outposts: string[];
	/** Files (a–h) without this side's pawns but with the opponent's. */
	halfOpen: string[];
	/** An isolated d-pawn. */
	iqp: boolean;
	/** Pawns side by side on the c- and d-files with no pawns of this side on the b- and e-files. */
	hangingPawns: boolean;
}

export interface BoardFeatures {
	white: SideFeatures;
	black: SideFeatures;
	/** Files without any pawn. */
	openFiles: string[];
	/** The side with two bishops against fewer, or null. */
	bishopPair: SideName | null;
	/** One bishop each, on squares of different colours. */
	oppositeBishops: boolean;
}

const FILES = 'abcdefgh';
const sideName = (color: Color): SideName => (color === 'w' ? 'white' : 'black');
/** Ranks ahead of `rank` for `color`: higher for White, lower for Black. */
const ahead = (color: Color, rank: number, other: number) => (color === 'w' ? other > rank : other < rank);

export function boardFeatures(fen: string): BoardFeatures {
	const pieces = piecesOf(new Chess(fen));
	const pawns = { w: pawnsOf(pieces, 'w'), b: pawnsOf(pieces, 'b') };
	const openFiles = [...FILES].filter((_, file) => !pawns.w.some((p) => fileOf(p) === file) && !pawns.b.some((p) => fileOf(p) === file));
	const bishops = (color: Color) => pieces.filter((piece) => piece.color === color && piece.type === 'b');
	const [whiteBishops, blackBishops] = [bishops('w'), bishops('b')];
	let bishopPair: SideName | null = null;
	if (whiteBishops.length >= 2 && blackBishops.length < 2) bishopPair = 'white';
	if (blackBishops.length >= 2 && whiteBishops.length < 2) bishopPair = 'black';
	const shade = (square: Square) => (fileOf(square) + rankOf(square)) % 2;
	const oppositeBishops =
		whiteBishops.length === 1 && blackBishops.length === 1 && shade(whiteBishops[0].square) !== shade(blackBishops[0].square);
	return {
		white: sideFeatures(pieces, pawns, 'w'),
		black: sideFeatures(pieces, pawns, 'b'),
		openFiles,
		bishopPair,
		oppositeBishops,
	};
}

function pawnsOf(pieces: PieceAt[], color: Color): Square[] {
	return pieces.filter((piece) => piece.type === 'p' && piece.color === color).map((piece) => piece.square);
}

function sideFeatures(pieces: PieceAt[], pawns: Record<Color, Square[]>, color: Color): SideFeatures {
	const own = pawns[color];
	const enemy = pawns[opposite(color)];
	const onFile = (list: Square[], file: number) => list.filter((square) => fileOf(square) === file);
	const forward = color === 'w' ? 1 : -1;

	const isolated = own.filter((square) => !own.some((other) => Math.abs(fileOf(other) - fileOf(square)) === 1));
	const doubled = own.filter((square) => onFile(own, fileOf(square)).length > 1);
	const passed = own.filter(
		(square) =>
			!enemy.some((other) => Math.abs(fileOf(other) - fileOf(square)) <= 1 && ahead(color, rankOf(square), rankOf(other))),
	);
	const backward = own.filter((square) => {
		if (isolated.includes(square)) return false;
		const file = fileOf(square);
		const rank = rankOf(square);
		// no pawn of its own on a neighbouring file level with it or behind can ever guard it
		const guarded = own.some(
			(other) => Math.abs(fileOf(other) - file) === 1 && (rankOf(other) === rank || !ahead(color, rank, rankOf(other))),
		);
		if (guarded) return false;
		// and an enemy pawn controls the square in front of it
		const stop = rank + forward;
		return enemy.some((other) => Math.abs(fileOf(other) - file) === 1 && rankOf(other) === stop + forward);
	});

	const occupied = new Map(pieces.map((piece) => [piece.square as string, piece]));
	const outposts: string[] = [];
	// the opponent's half short of the last two ranks: 5–6 for White, 4–3 for Black; b- to g-file
	for (const rank of color === 'w' ? [4, 5] : [3, 2]) {
		for (let file = 1; file <= 6; file++) {
			const square = squareAt(file, rank) as Square;
			if (occupied.get(square)?.type === 'p') continue;
			const attackable = enemy.some((other) => Math.abs(fileOf(other) - file) === 1 && ahead(color, rank, rankOf(other)));
			if (attackable) continue;
			const guard = own.some((other) => Math.abs(fileOf(other) - file) === 1 && rankOf(other) === rank - forward);
			if (guard) outposts.push(square);
		}
	}

	const files = new Set(own.map(fileOf));
	const enemyFiles = new Set(enemy.map(fileOf));
	const halfOpen = [...FILES].filter((_, file) => !files.has(file) && enemyFiles.has(file));
	const iqp = files.has(3) && !files.has(2) && !files.has(4);
	const cPawns = onFile(own, 2);
	const dPawns = onFile(own, 3);
	const hangingPawns =
		cPawns.length === 1 && dPawns.length === 1 && rankOf(cPawns[0]) === rankOf(dPawns[0]) && !files.has(1) && !files.has(4);

	const sorted = (list: string[]) => [...new Set(list)].sort();
	return {
		isolated: sorted(isolated),
		doubled: sorted(doubled),
		backward: sorted(backward),
		passed: sorted(passed),
		outposts: sorted(outposts),
		halfOpen,
		iqp,
		hangingPawns,
	};
}

/** Named structures for the games library filters, e.g. "iqp" or "oppositeBishops". */
export function structureTags(features: BoardFeatures): string[] {
	const tags = new Set<string>();
	for (const side of [features.white, features.black]) {
		if (side.iqp) tags.add('iqp');
		if (side.hangingPawns) tags.add('hangingPawns');
		if (side.passed.length) tags.add('passedPawn');
		if (side.doubled.length) tags.add('doubledPawns');
		if (side.backward.length) tags.add('backwardPawn');
	}
	if (features.oppositeBishops) tags.add('oppositeBishops');
	if (features.bishopPair) tags.add('bishopPair');
	return [...tags].sort();
}

/**
 * What a quiet move does with the structure: goes to an outpost, takes an open or half-open file,
 * hits a weak pawn, pushes or creates a passed pawn. Empty when it does none of these.
 */
export function positionalThemes(fen: string, uci: string): string[] {
	const chess = new Chess(fen);
	const color = chess.turn();
	const side = sideName(color);
	const before = boardFeatures(fen);
	let move: Move;
	try {
		move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
	} catch {
		return [];
	}
	if (move.captured || chess.isCheck()) return [];
	const after = boardFeatures(chess.fen());
	const themes = new Set<string>();
	const file = move.to[0];
	if ((move.piece === 'n' || move.piece === 'b') && before[side].outposts.includes(move.to)) themes.add('outpost');
	if ((move.piece === 'r' || move.piece === 'q') && move.from[0] !== file && (before.openFiles.includes(file) || before[side].halfOpen.includes(file))) {
		themes.add('openFile');
	}
	const enemy = before[side === 'white' ? 'black' : 'white'];
	if (move.piece !== 'p' && move.piece !== 'k') {
		// the moved piece now attacks a weak pawn it did not attack before
		const previous = new Chess(fen);
		const weak = [...enemy.isolated, ...enemy.backward] as Square[];
		if (weak.some((square) => newlyAttacks(previous, chess, move, square))) themes.add('weakPawn');
	}
	if (move.piece === 'p') {
		if (before[side].passed.includes(move.from)) themes.add('passedPawn');
		else if (after[side].passed.length > before[side].passed.length) themes.add('passedPawn');
		// a pawn break: the pawn now attacks an enemy pawn
		const attacked = chess.board().flat().some(
			(cell) => cell?.type === 'p' && cell.color !== color && chess.attackers(cell.square, color).includes(move.to as Square),
		);
		if (attacked) themes.add('pawnBreak');
	}
	return [...themes].sort();
}

/** Endgame families grouped for practice: pawn, rook, minor piece, queen, or mixed. */
export function endgameGroup(type: string | null): string | null {
	switch (type) {
		case null:
			return null;
		case 'pawn':
		case 'rook':
			return type;
		case 'queen':
		case 'queenAndPieces':
			return 'queen';
		case 'bishop':
		case 'knight':
		case 'knightVsBishop':
			return 'minor';
		default:
			return 'mixed';
	}
}

/** A legal move that stalemates the opponent: the trap in a won ending. */
export function stalemateMoves(fen: string): string[] {
	const chess = new Chess(fen);
	return chess
		.moves({ verbose: true })
		.filter((move) => {
			chess.move(move);
			const stalemate = chess.isStalemate();
			chess.undo();
			return stalemate;
		})
		.map((move) => move.lan);
}

/** Opening principles a move follows: castling, developing a minor piece, taking the centre. */
export function openingPrinciples(fen: string, uci: string): string[] {
	const chess = new Chess(fen);
	let move: Move;
	try {
		move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
	} catch {
		return [];
	}
	const tags: string[] = [];
	const homeRank = move.color === 'w' ? '1' : '8';
	if (move.isKingsideCastle() || move.isQueensideCastle()) tags.push('castle');
	if ((move.piece === 'n' || move.piece === 'b') && move.from[1] === homeRank) tags.push('develop');
	const centre: Square[] = ['d4', 'e4', 'd5', 'e5'];
	const previous = new Chess(fen);
	const takesCentre =
		move.piece === 'p'
			? centre.includes(move.to)
			: move.piece !== 'k' && centre.some((square) => newlyAttacks(previous, chess, move, square));
	if (takesCentre) tags.push('centre');
	if (move.captured) tags.push('material');
	return tags;
}

/** Whether the piece `move` played attacks `square` from its new square but did not from the old one. */
function newlyAttacks(before: Chess, after: Chess, move: Move, square: Square): boolean {
	return after.attackers(square, move.color).includes(move.to) && !before.attackers(square, move.color).includes(move.from);
}

/** Piece name for a symbol, e.g. "knight". */
export const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
