import { Chess, type Color, type Move, type Square } from 'chess.js';
import { VALUE, balance, fileOf, kingSquare, opposite, piecesOf, rankOf, squareAt } from './board.ts';

export interface PvWalk {
	san: string[];
	uci: string[];
	/** Side-to-move material change after each ply, pawns. */
	material: number[];
	motifs: string[];
	/** Plies until the line's gain is secured (mate delivered, material won and kept). */
	calcDepth: number;
	/** Material the side to move wins and keeps within the calculable part of the line (0 if none). */
	gain: number;
	/** Checks given by the side to move within the line. */
	checks: number;
	firstCapture: boolean;
	firstCheck: boolean;
	/** First move is neither a capture, check nor promotion. */
	firstQuiet: boolean;
	endsInMate: boolean;
}

const DIRECTIONS = {
	b: [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1],
	],
	r: [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	],
} as const;

/** Material won only after this many plies is engine horizon, not something to calculate. */
const MAX_REALISED_PLY = 9;

/**
 * Plays an engine line from `fen` and records what happens along it. `cp` is the line's score
 * (side to move): material won on the board only counts when the score agrees.
 */
export function walkPv(fen: string, pv: string[], maxPlies: number, cp = Infinity): PvWalk {
	const chess = new Chess(fen);
	const side = chess.turn();
	const start = balance(piecesOf(chess), side);
	const walk: PvWalk = {
		san: [],
		uci: [],
		material: [],
		motifs: [],
		calcDepth: 1,
		gain: 0,
		checks: 0,
		firstCapture: false,
		firstCheck: false,
		firstQuiet: false,
		endsInMate: false,
	};
	const motifs = new Set<string>();
	for (let i = 0; i < Math.min(pv.length, maxPlies); i++) {
		const uci = pv[i];
		let move: Move;
		try {
			move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
		} catch {
			break;
		}
		walk.san.push(move.san);
		walk.uci.push(uci);
		walk.material.push(balance(piecesOf(chess), side) - start);
		if (move.color === side) {
			if (chess.isCheck()) walk.checks++;
			if (i <= 2) detectMoveMotifs(chess, move, motifs, i === 0);
		}
		if (i === 0) {
			walk.firstCapture = Boolean(move.captured);
			walk.firstCheck = chess.isCheck();
			walk.firstQuiet = !move.captured && !move.promotion && !chess.isCheck();
		}
		if (chess.isCheckmate()) {
			walk.endsInMate = true;
			motifs.add('mate');
			if (isBackRankMate(chess)) motifs.add('backRankMate');
			break;
		}
	}
	const m = walk.material;
	const realised = realisedAt(m);
	if (realised > 0 && cp >= 100) walk.gain = m[m.length - 1];
	if (m.length >= 3 && m[1] <= -2 && m[2] <= -1.5 && cp >= -50) motifs.add('sacrifice');
	if (walk.firstQuiet && (walk.endsInMate || walk.gain >= 2)) motifs.add('quietMove');
	walk.calcDepth = walk.endsInMate ? m.length : walk.gain ? realised : forcingPrefix(walk.san);
	walk.motifs = [...motifs];
	return walk;
}

/** Ply (1-based, rounded up to the side to move's move) from which a material gain of 1.5+ holds; 0 if none. */
function realisedAt(m: number[]): number {
	const final = m.at(-1) ?? 0;
	if (final < 1.5) return 0;
	let depth = m.length;
	for (let i = m.length - 1; i >= 0 && m[i] >= final - 0.5; i--) depth = i + 1;
	if (depth % 2 === 0) depth++;
	return depth <= MAX_REALISED_PLY ? depth : 0;
}

/** Checks and captures by either side at the start of the line. */
function forcingPrefix(san: string[]): number {
	let forcing = 0;
	while (forcing < san.length && /[x+#]/.test(san[forcing])) forcing++;
	return Math.max(1, forcing);
}

function detectMoveMotifs(chess: Chess, move: Move, motifs: Set<string>, first: boolean): void {
	const side = move.color;
	const enemy = opposite(side);
	const pieces = piecesOf(chess);
	if (move.promotion) motifs.add(move.promotion === 'q' ? 'promotion' : 'underPromotion');

	const king = kingSquare(pieces, enemy);
	if (king && chess.isCheck()) {
		const checkers = chess.attackers(king, side);
		if (checkers.length >= 2) motifs.add('doubleCheck');
		else if (!checkers.includes(move.to)) motifs.add('discoveredCheck');
	}

	if (first && move.captured && VALUE[move.captured] >= 3 && !chess.attackers(move.to, enemy).length) {
		motifs.add('hangingPiece');
	}

	// fork: the moved piece hits two targets that are the king, worth more, or undefended
	const value = VALUE[move.piece] || 100;
	let targets = 0;
	for (const piece of pieces) {
		if (piece.color !== enemy || piece.type === 'p') continue;
		if (!chess.attackers(piece.square, side).includes(move.to)) continue;
		const worth = piece.type === 'k' ? 100 : VALUE[piece.type];
		if (worth > value || !chess.attackers(piece.square, enemy).length) targets++;
	}
	if (targets >= 2) motifs.add('fork');

	if (move.piece === 'b' || move.piece === 'r' || move.piece === 'q') {
		const directions =
			move.piece === 'q' ? [...DIRECTIONS.b, ...DIRECTIONS.r] : DIRECTIONS[move.piece as 'b' | 'r'];
		for (const [df, dr] of directions) {
			const line = lineFrom(chess, move.to, df, dr, 2);
			if (line.length < 2 || line[0].color !== enemy || line[1].color !== enemy) continue;
			const [front, back] = line;
			const frontValue = front.type === 'k' ? 100 : VALUE[front.type];
			const backValue = back.type === 'k' ? 100 : VALUE[back.type];
			// pin: a piece in front of the king or queen (or a minor in front of a rook)
			if (frontValue >= 3 && (back.type === 'k' || back.type === 'q' || (back.type === 'r' && frontValue === 3))) {
				if (backValue > frontValue) motifs.add('pin');
			}
			// skewer: king or queen in front, a real piece behind
			if ((front.type === 'k' || front.type === 'q') && backValue >= (front.type === 'k' ? 3 : 5) && backValue < frontValue) {
				motifs.add('skewer');
			}
		}
	}
}

/** The first `count` pieces met walking from `from` in one direction. */
function lineFrom(chess: Chess, from: Square, df: number, dr: number, count: number) {
	const found: { square: Square; type: keyof typeof VALUE; color: Color }[] = [];
	let file = fileOf(from) + df;
	let rank = rankOf(from) + dr;
	for (let square = squareAt(file, rank); square && found.length < count; square = squareAt(file, rank)) {
		const piece = chess.get(square);
		if (piece) found.push({ square, type: piece.type, color: piece.color });
		file += df;
		rank += dr;
	}
	return found;
}

function isBackRankMate(chess: Chess): boolean {
	const mated = chess.turn();
	const king = kingSquare(piecesOf(chess), mated);
	if (!king) return false;
	const backRank = mated === 'w' ? 0 : 7;
	if (rankOf(king) !== backRank) return false;
	return chess
		.attackers(king, opposite(mated))
		.some((square) => rankOf(square) === backRank && ['r', 'q'].includes(chess.get(square)?.type ?? ''));
}
