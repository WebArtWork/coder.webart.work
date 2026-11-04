import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { Side } from '../chess/chess.interface';

/**
 * Chess basics: multiple-choice questions on how the pieces move, what they are worth and how
 * moves are written. Built in the browser from the specs below; move names and legal squares come
 * from chess.js, so they are always right. Notation stays English (K, Q, R, B, N) in every language.
 */

export type BasicsTopic = 'moves' | 'values' | 'notation';

/** An answer option; `vars` fill its placeholders. */
export interface BasicsChoice {
	label: string;
	vars?: Record<string, string | number>;
}

export interface BasicsItem {
	id: string;
	rating: number;
	topic: BasicsTopic;
	fen: string;
	side: Side;
	question: string;
	vars?: Record<string, string>;
	/** In a fixed order per item, so a review shows the same question. */
	choices: BasicsChoice[];
	answer: number;
	/** Choices are notation, squares or numbers, shown as they are rather than translated. */
	literal: boolean;
	explain: string;
	/** Marked while asking: the piece or square the question is about. */
	marks?: string[];
	/** Marked after answering, e.g. every square the piece can reach. */
	reveal?: string[];
	/** The move to name, drawn as an arrow. */
	arrow?: { from: string; to: string };
}

export const BASICS_TOPICS: { value: BasicsTopic | 'all'; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'moves', label: 'How pieces move' },
	{ value: 'values', label: 'Piece values' },
	{ value: 'notation', label: 'Notation' },
];

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const PIECE_RULES: Record<PieceSymbol, string> = {
	p: 'A pawn moves straight forward one square (two from its starting square) and captures one square diagonally forward. It never moves backward.',
	n: 'A knight moves in an L: two squares in one direction, then one to the side. It jumps over anything in the way.',
	b: 'A bishop moves any number of squares diagonally, until a piece is in the way. It stays on squares of one color.',
	r: 'A rook moves any number of squares along its rank or file, until a piece is in the way.',
	q: 'A queen moves like a rook and a bishop together: any number of squares in a straight line or diagonally.',
	k: 'A king moves one square in any direction, and never onto a square the opponent attacks.',
};

/** A text question; the first choice is the right one. */
interface TextSpec {
	id: string;
	rating: number;
	topic: BasicsTopic;
	fen?: string;
	side?: Side;
	question: string;
	vars?: Record<string, string>;
	choices: (string | BasicsChoice)[];
	literal?: boolean;
	explain: string;
	marks?: string[];
}

const TEXT: TextSpec[] = [
	// how pieces move
	{
		id: 'rule-jump',
		rating: 450,
		topic: 'moves',
		fen: START,
		question: 'Which piece can jump over other pieces?',
		choices: ['The knight', 'The queen', 'The bishop', 'The king'],
		explain: PIECE_RULES.n,
		marks: ['b1', 'g1'],
	},
	{
		id: 'rule-pawn-start',
		rating: 450,
		topic: 'moves',
		fen: START,
		question: 'From its starting square, how far can a pawn move?',
		choices: ['One or two squares forward', 'Only one square forward', 'Two squares in any direction', 'One square diagonally'],
		explain: PIECE_RULES.p,
		marks: ['e2'],
	},
	{
		id: 'rule-pawn-capture',
		rating: 500,
		topic: 'moves',
		fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
		question: 'How does a pawn capture?',
		choices: ['One square diagonally forward', 'One square straight forward', 'One square diagonally backward', 'Like a knight'],
		explain: 'Here the e4-pawn can capture the d5-pawn. A pawn moves straight but captures diagonally; a piece right in front of it blocks it.',
		marks: ['e4', 'd5'],
	},
	{
		id: 'rule-bishop-color',
		rating: 550,
		topic: 'moves',
		fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1',
		question: 'This bishop starts on a dark square. Where can it ever go?',
		choices: ['Only dark squares', 'Only light squares', 'Any square', 'Only its own diagonal'],
		explain: PIECE_RULES.b,
		marks: ['c1'],
	},
	{
		id: 'rule-castling',
		rating: 650,
		topic: 'moves',
		fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1',
		question: 'When may you castle?',
		choices: [
			'King and rook have not moved, the squares between them are empty, and the king is not in check and does not cross or land on an attacked square',
			'Any time the squares between the king and the rook are empty',
			'Only after move 10',
			'Only when your king is in check',
		],
		explain: 'Castling moves the king two squares toward a rook, and the rook jumps to the square the king crossed. O-O is kingside, O-O-O is queenside.',
		marks: ['e1', 'a1', 'h1'],
	},
	{
		id: 'rule-promotion',
		rating: 550,
		topic: 'moves',
		fen: '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1',
		question: 'What can a pawn become when it reaches the last rank?',
		choices: ['A queen, rook, bishop or knight', 'Only a queen', 'Any piece, even a king', 'Nothing, it stays a pawn'],
		explain: 'A pawn that reaches the last rank must promote, usually to a queen. You choose; it does not depend on which pieces were captured.',
		marks: ['b7'],
	},
	{
		id: 'rule-en-passant',
		rating: 800,
		topic: 'moves',
		fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
		question: 'Black has just played f7-f5. When can the e5-pawn capture it en passant?',
		choices: ['Only right now, on this move', 'On any later move', 'Never: pawns cannot capture sideways', 'Only if the f5-pawn is protected'],
		explain: 'En passant: when an enemy pawn moves two squares and lands right beside your pawn, your pawn may capture it as if it had moved one square. Only on the very next move. Here it is written exf6.',
		marks: ['e5', 'f5'],
	},
	{
		id: 'rule-stalemate',
		rating: 700,
		topic: 'moves',
		fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
		side: 'white',
		question: 'Black to move is not in check but has no legal move. What is the result?',
		choices: ['A draw by stalemate', 'White wins', 'Black wins', 'Black skips the move'],
		explain: 'Stalemate: the side to move is not in check and has no legal move. The game is a draw, so with a big advantage, always leave the opponent a move.',
		marks: ['h8'],
	},
	// piece values
	{
		id: 'value-king',
		rating: 450,
		topic: 'values',
		fen: '8/8/8/8/4K3/8/8/8 w - - 0 1',
		question: 'What is the king worth?',
		choices: ['It has no point value: lose it and you lose the game', '9 points', '4 points', '1 point'],
		explain: 'The king is never traded or captured. Checkmate ends the game, so the king is beyond any count of material.',
		marks: ['e4'],
	},
	{
		id: 'trade-rook-bishop',
		rating: 550,
		topic: 'values',
		fen: '4k3/8/8/8/3b4/8/8/3RK3 w - - 0 1',
		question: 'You give your rook for your opponent’s bishop. What is the result?',
		choices: ['You lose 2 points', 'You win 2 points', 'An even trade', 'You lose 3 points'],
		explain: 'A rook is worth 5 and a bishop 3, so you give 5 and get 3: 2 points down. Giving a rook for a minor piece is called losing the exchange.',
		marks: ['d1', 'd4'],
	},
	{
		id: 'trade-knight-bishop',
		rating: 500,
		topic: 'values',
		fen: '4k3/8/8/8/3b4/8/4N3/4K3 w - - 0 1',
		question: 'You give your knight for your opponent’s bishop. What is the result?',
		choices: ['An even trade', 'You lose 1 point', 'You win 1 point', 'You lose 3 points'],
		explain: 'A knight and a bishop are both worth about 3. Which one is better depends on the position.',
		marks: ['e2', 'd4'],
	},
	{
		id: 'compare-rook-minors',
		rating: 650,
		topic: 'values',
		fen: '4k3/8/8/8/8/8/8/1NB1K2R w - - 0 1',
		question: 'Which is usually worth more: a rook, or a bishop and a knight together?',
		choices: ['A bishop and a knight (6)', 'A rook (5)', 'They are exactly equal', 'A rook, because it moves further'],
		explain: 'Add the points: bishop 3 + knight 3 = 6, more than a rook’s 5. Two active minor pieces are often stronger than a rook in the middlegame.',
	},
	{
		id: 'compare-queen-rooks',
		rating: 700,
		topic: 'values',
		fen: '4k3/8/8/8/8/8/8/R2QK2R w - - 0 1',
		question: 'Which is usually worth more: a queen, or two rooks?',
		choices: ['Two rooks (10)', 'A queen (9)', 'They are exactly equal', 'A queen, because it moves in every direction'],
		explain: 'Two rooks are worth 5 + 5 = 10, a queen 9. Points are a guide: the position decides in the end.',
	},
	// notation: letters and symbols
	{
		id: 'letter-knight',
		rating: 450,
		topic: 'notation',
		fen: '8/8/8/8/3N4/8/8/8 w - - 0 1',
		question: 'Which letter stands for the knight?',
		choices: ['N', 'K', 'Kn', 'H'],
		literal: true,
		explain: 'K is taken by the king, so the knight is N. The letters are K king, Q queen, R rook, B bishop, N knight.',
		marks: ['d4'],
	},
	{
		id: 'letter-bishop',
		rating: 400,
		topic: 'notation',
		fen: '8/8/8/8/3B4/8/8/8 w - - 0 1',
		question: 'Which letter stands for the bishop?',
		choices: ['B', 'S', 'C', 'Bi'],
		literal: true,
		explain: 'The letters are K king, Q queen, R rook, B bishop, N knight. This app always uses these English letters.',
		marks: ['d4'],
	},
	{
		id: 'letter-rook',
		rating: 400,
		topic: 'notation',
		fen: '8/8/8/8/3R4/8/8/8 w - - 0 1',
		question: 'Which letter stands for the rook?',
		choices: ['R', 'T', 'L', 'Ro'],
		literal: true,
		explain: 'The letters are K king, Q queen, R rook, B bishop, N knight. This app always uses these English letters.',
		marks: ['d4'],
	},
	{
		id: 'letter-queen',
		rating: 400,
		topic: 'notation',
		fen: '8/8/8/8/3Q4/8/8/8 w - - 0 1',
		question: 'Which letter stands for the queen?',
		choices: ['Q', 'F', 'D', 'K'],
		literal: true,
		explain: 'The letters are K king, Q queen, R rook, B bishop, N knight. This app always uses these English letters.',
		marks: ['d4'],
	},
	{
		id: 'letter-pawn',
		rating: 500,
		topic: 'notation',
		fen: START,
		question: 'How is a pawn move written?',
		choices: ['No letter, only the square: e4', 'With P: Pe4', 'With the starting square: e2', 'With a small p: pe4'],
		explain: 'Pawns have no letter. A pawn move is just its destination square; a pawn capture starts with the file the pawn came from, like exd5.',
		marks: ['e2', 'e4'],
	},
	{
		id: 'symbol-x',
		rating: 450,
		topic: 'notation',
		question: 'What does “x” mean in a move, as in Bxc6?',
		choices: ['A capture', 'Check', 'A bad move', 'Checkmate'],
		explain: 'x marks a capture: Bxc6 means a bishop captures on c6.',
	},
	{
		id: 'symbol-check',
		rating: 450,
		topic: 'notation',
		question: 'What does “+” after a move mean, as in Qh5+?',
		choices: ['Check', 'A capture', 'A good move', 'Checkmate'],
		explain: '+ is check, # is checkmate.',
	},
	{
		id: 'symbol-mate',
		rating: 500,
		topic: 'notation',
		question: 'What does “#” after a move mean, as in Qxf7#?',
		choices: ['Checkmate', 'Check', 'A capture', 'A brilliant move'],
		explain: '# is checkmate, the end of the game. + is an ordinary check.',
	},
	{
		id: 'symbol-short-castle',
		rating: 550,
		topic: 'notation',
		question: 'What does O-O mean?',
		choices: ['Castling kingside (short)', 'Castling queenside (long)', 'A draw', 'Both kings moved'],
		explain: 'O-O is castling with the h-rook (kingside, short). O-O-O is castling with the a-rook (queenside, long): three O’s for the longer side.',
	},
	{
		id: 'symbol-long-castle',
		rating: 550,
		topic: 'notation',
		question: 'What does O-O-O mean?',
		choices: ['Castling queenside (long)', 'Castling kingside (short)', 'A draw', 'Three checks in a row'],
		explain: 'O-O-O is castling with the a-rook (queenside, long). O-O is castling with the h-rook (kingside, short).',
	},
	{
		id: 'symbol-promotion',
		rating: 600,
		topic: 'notation',
		question: 'What does e8=Q mean?',
		choices: ['A pawn moves to e8 and becomes a queen', 'The queen moves to e8', 'The queen and a pawn swap places', 'A queen is captured on e8'],
		explain: 'The = sign shows promotion: the pawn reaches e8 and is replaced by the piece after it.',
	},
	{
		id: 'symbol-result',
		rating: 500,
		topic: 'notation',
		question: 'A game record ends with 0-1. Who won?',
		choices: ['Black', 'White', 'Nobody, it was a draw', 'The game was not finished'],
		explain: 'The result is written White’s score first: 1-0 White won, 0-1 Black won, ½-½ a draw.',
	},
	{
		id: 'symbol-blunder',
		rating: 600,
		topic: 'notation',
		question: 'What does “??” after a move mean?',
		choices: ['A blunder', 'A brilliant move', 'A check', 'An interesting move'],
		explain: 'Comments after a move: ! good, !! brilliant, ? mistake, ?? blunder, !? interesting, ?! dubious.',
	},
	{
		id: 'record-pair',
		rating: 550,
		topic: 'notation',
		question: 'How are White’s and Black’s first moves written in a game record?',
		choices: ['1.e4 e5', '1.e4 2.e5', 'e4 1.e5', '1-e4-e5'],
		literal: true,
		explain: 'Each number covers one move by White and one by Black: 1.e4 e5 2.Nf3 Nc6 and so on.',
	},
	{
		id: 'record-black',
		rating: 650,
		topic: 'notation',
		question: 'What does 12...Nf6 mean?',
		choices: ['Black’s 12th move: a knight to f6', 'White’s 12th move: a knight to f6', 'A knight moves 12 squares to f6', 'Black’s 13th move: a knight to f6'],
		explain: 'Three dots after the number mean the move is Black’s. They are used when Black’s move is written on its own, without White’s move before it.',
	},
	{
		id: 'read-nbd2',
		rating: 850,
		topic: 'notation',
		fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3',
		question: 'What does {san} mean?',
		vars: { san: 'Nbd2' },
		choices: ['The knight on the b-file goes to d2', 'The knight on b2 goes to d2', 'A knight and a bishop both go to d2', 'The knight captures on d2'],
		explain: 'Both knights, on b1 and f3, can reach d2. The b tells which one moves: the knight from the b-file.',
		marks: ['b1', 'f3'],
	},
	{
		id: 'read-r1a3',
		rating: 900,
		topic: 'notation',
		fen: '7k/8/8/R7/8/8/8/R5K1 w - - 0 1',
		question: 'What does {san} mean?',
		vars: { san: 'R1a3' },
		choices: ['The rook on the 1st rank goes to a3', 'The rook on a1 moves 3 squares', 'The first rook to move goes to a3', 'Both rooks go to a3'],
		explain: 'Both rooks are on the a-file, so the file does not tell them apart. The rank does: R1a3 is the rook from a1, R5a3 the rook from a5.',
		marks: ['a1', 'a5'],
	},
];

/** Name the square marked on the board; the board can be seen from either side. */
const SQUARES: { id: string; rating: number; square: string; side: Side }[] = [
	{ id: 'square-e4', rating: 450, square: 'e4', side: 'white' },
	{ id: 'square-g7', rating: 500, square: 'g7', side: 'white' },
	{ id: 'square-b3', rating: 650, square: 'b3', side: 'black' },
	{ id: 'square-f6', rating: 650, square: 'f6', side: 'black' },
];

/** Where can the piece on `square` go? One legal square among squares it cannot reach. */
const REACH: { id: string; rating: number; fen: string; square: Square }[] = [
	{ id: 'reach-knight', rating: 500, fen: '4k3/8/8/8/3N4/8/8/4K3 w - - 0 1', square: 'd4' },
	{ id: 'reach-knight-start', rating: 450, fen: START, square: 'b1' },
	{ id: 'reach-bishop', rating: 500, fen: '4k3/8/8/8/8/8/3P4/2B1K3 w - - 0 1', square: 'c1' },
	{ id: 'reach-rook', rating: 550, fen: '4k3/8/8/P7/8/8/8/R3K3 w - - 0 1', square: 'a1' },
	{ id: 'reach-queen', rating: 600, fen: '4k3/8/5p2/8/3Q4/2P5/8/4K3 w - - 0 1', square: 'd4' },
	{ id: 'reach-king', rating: 500, fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', square: 'e1' },
	{ id: 'reach-king-attacked', rating: 750, fen: '4k3/8/8/8/8/8/r7/4K3 w - - 0 1', square: 'e1' },
	{ id: 'reach-pawn', rating: 450, fen: START, square: 'e2' },
	{ id: 'reach-pawn-capture', rating: 600, fen: '4k3/8/8/3np3/4P3/8/8/4K3 w - - 0 1', square: 'e4' },
	{ id: 'reach-black-knight', rating: 600, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', square: 'g8' },
];

/** Who is ahead in material? Counted from the board. */
const MATERIAL: { id: string; rating: number; fen: string }[] = [
	{ id: 'count-extra-rook', rating: 550, fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1' },
	{ id: 'count-equal', rating: 650, fen: 'r1b3k1/pp3ppp/8/8/8/8/PP3PPP/2BR2K1 w - - 0 1' },
	{ id: 'count-exchange', rating: 750, fen: 'r5k1/5ppp/2n5/8/8/2B5/5PPP/1N4K1 w - - 0 1' },
	{ id: 'count-queen-rooks', rating: 850, fen: '2q3k1/5ppp/8/8/8/8/R4PPP/R5K1 w - - 0 1' },
];

/** How is the arrowed move written? The answer is chess.js's SAN; `wrong` are the other choices. */
const WRITE: { id: string; rating: number; fen: string; move: string; wrong: string[]; explain: string }[] = [
	{
		id: 'write-pawn',
		rating: 500,
		fen: START,
		move: 'e2e4',
		wrong: ['Pe4', 'E4', 'e2'],
		explain: 'A pawn move is just the destination square, in lower case. Pawns have no letter.',
	},
	{
		id: 'write-knight',
		rating: 550,
		fen: START,
		move: 'g1f3',
		wrong: ['Kf3', 'Nf6', 'Nh3'],
		explain: 'The piece letter, then the square it goes to. The knight is N, because K is the king.',
	},
	{
		id: 'write-bishop',
		rating: 550,
		fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
		move: 'f1c4',
		wrong: ['Bc5', 'Bxc4', 'B4'],
		explain: 'The piece letter, then the destination square. Nothing is captured, so there is no x.',
	},
	{
		id: 'write-pawn-capture',
		rating: 650,
		fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
		move: 'e4d5',
		wrong: ['xd5', 'dxe4', 'exd4'],
		explain: 'A pawn capture starts with the file the pawn comes from: e, then x, then the square.',
	},
	{
		id: 'write-piece-capture',
		rating: 600,
		fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
		move: 'b5c6',
		wrong: ['Bc6', 'xc6', 'Bxc6+'],
		explain: 'Piece letter, x for the capture, then the square: Bxc6. It is not check, so there is no +.',
	},
	{
		id: 'write-check',
		rating: 650,
		fen: 'rnbqkbnr/ppppp1pp/5p2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
		move: 'd1h5',
		wrong: ['Qh5', 'Qh5#', 'Qxh5+'],
		explain: 'The queen gives check, so + goes at the end. Black can still block with g6, so it is not #.',
	},
	{
		id: 'write-mate',
		rating: 700,
		fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
		move: 'h5f7',
		wrong: ['Qxf7+', 'Qf7#', 'Qxf7'],
		explain: 'The queen captures on f7 and the king cannot escape: x for the capture, # for checkmate.',
	},
	{
		id: 'write-short-castle',
		rating: 600,
		fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
		move: 'e1g1',
		wrong: ['O-O-O', 'Kg1', 'Rf1'],
		explain: 'Castling is written by its own sign, not by the king’s square: O-O kingside, O-O-O queenside.',
	},
	{
		id: 'write-long-castle',
		rating: 650,
		fen: 'r3kbnr/ppp1pppp/2nq4/3p1b2/3P1B2/2NQ4/PPP1PPPP/R3KBNR w KQkq - 6 5',
		move: 'e1c1',
		wrong: ['O-O', 'Kc1', 'Kb1'],
		explain: 'Castling with the a-rook is O-O-O: queenside, the long side.',
	},
	{
		id: 'write-promotion',
		rating: 700,
		fen: '8/4P3/8/8/8/2k5/8/4K3 w - - 0 1',
		move: 'e7e8q',
		wrong: ['e8', 'Qe8', 'e7=Q'],
		explain: 'The destination square, = and the new piece: e8=Q.',
	},
	{
		id: 'write-en-passant',
		rating: 850,
		fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
		move: 'e5f6',
		wrong: ['exf5', 'f6', 'xf6'],
		explain: 'En passant is written like any pawn capture, with the square the pawn lands on: exf6, though the captured pawn stood on f5.',
	},
	{
		id: 'write-rooks-rank',
		rating: 900,
		fen: 'r5k1/5ppp/8/8/8/8/5PPP/R4RK1 w - - 0 1',
		move: 'a1d1',
		wrong: ['Rd1', 'Rfd1', 'R1d1'],
		explain: 'Both rooks can reach d1, so Rd1 is not clear. They stand on different files, so add the file of the rook that moves: Rad1.',
	},
	{
		id: 'write-rooks-file',
		rating: 950,
		fen: '7k/8/8/R7/8/8/8/R5K1 w - - 0 1',
		move: 'a1a3',
		wrong: ['Ra3', 'Raa3', 'R5a3'],
		explain: 'Both rooks can reach a3 and both are on the a-file, so the file does not help. Add the rank instead: R1a3.',
	},
	{
		id: 'write-knights-file',
		rating: 900,
		fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3',
		move: 'b1d2',
		wrong: ['Nd2', 'Nfd2', 'N1d2'],
		explain: 'Both knights can reach d2. Add the file of the knight that moves: Nbd2.',
	},
	{
		id: 'write-knights-rank',
		rating: 1000,
		fen: 'rnbqkbnr/pppp1ppp/8/4p1N1/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1',
		move: 'g5f3',
		wrong: ['Nf3', 'Ngf3', 'N1f3'],
		explain: 'Both knights are on the g-file, so Ngf3 is still unclear. Use the rank of the knight that moves: N5f3.',
	},
	{
		id: 'write-pawns-capture',
		rating: 750,
		fen: 'rnbqkbnr/ppp1pppp/8/3p4/2P1P3/8/PP1P1PPP/RNBQKBNR w KQkq - 0 3',
		move: 'c4d5',
		wrong: ['xd5', 'exd5', 'Pxd5'],
		explain: 'Two pawns can capture on d5. The file a pawn capture starts with already says which one: cxd5.',
	},
	{
		id: 'write-rooks-capture-mate',
		rating: 1100,
		fen: 'R2r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
		move: 'a8d8',
		wrong: ['Rxd8#', 'Rdxd8#', 'Raxd8+'],
		explain: 'Both rooks can capture on d8, so add the file of the one that moves (a), then x, the square, and # because it is mate: Raxd8#.',
	},
	{
		id: 'write-three-queens',
		rating: 1200,
		fen: '1k6/8/8/8/4Q2Q/8/8/K6Q w - - 0 1',
		move: 'h4e1',
		wrong: ['Qe1', 'Qhe1', 'Q4e1'],
		explain: 'Three queens can reach e1. Qhe1 could be h4 or h1, Q4e1 could be h4 or e4, so only the full square is clear: Qh4e1. This is rare, but it shows the rule.',
	},
];

/** Every question, built once with chess.js. */
export function basicsItems(): BasicsItem[] {
	return [
		...TEXT.map(textItem),
		...SQUARES.map(squareItem),
		...REACH.map(reachItem),
		...MATERIAL.map(materialItem),
		...WRITE.map(writeItem),
	];
}

function textItem(spec: TextSpec): BasicsItem {
	const choices = spec.choices.map((choice) => (typeof choice === 'string' ? { label: choice } : choice));
	return {
		id: spec.id,
		rating: spec.rating,
		topic: spec.topic,
		fen: spec.fen ?? START,
		side: spec.side ?? sideOf(spec.fen ?? START),
		question: spec.question,
		vars: spec.vars,
		literal: spec.literal ?? false,
		explain: spec.explain,
		marks: spec.marks,
		...shuffled(spec.id, choices),
	};
}

function squareItem(spec: (typeof SQUARES)[number]): BasicsItem {
	const [file, rank] = [spec.square.charCodeAt(0) - 97, Number(spec.square[1])];
	// the same square seen from the other side, and its neighbours: the usual mix-ups
	const mirror = String.fromCharCode(97 + 7 - file) + (9 - rank);
	const beside = String.fromCharCode(97 + (file < 7 ? file + 1 : file - 1)) + rank;
	const above = String.fromCharCode(97 + file) + (rank < 8 ? rank + 1 : rank - 1);
	return {
		id: spec.id,
		rating: spec.rating,
		topic: 'notation',
		fen: '8/8/8/8/8/8/8/8 w - - 0 1',
		side: spec.side,
		question: 'What is the name of the marked square?',
		literal: true,
		explain: 'Files are letters a–h from White’s left to right, ranks are numbers 1–8 from White’s side. Read the file first, then the rank. From Black’s side the board is turned around.',
		marks: [spec.square],
		...shuffled(spec.id, [spec.square, mirror, beside, above].map((label) => ({ label }))),
	};
}

function reachItem(spec: (typeof REACH)[number]): BasicsItem {
	const game = new Chess(spec.fen);
	const piece = game.get(spec.square)!;
	const legal = [...new Set(game.moves({ square: spec.square, verbose: true }).map((move) => move.to as string))];
	const random = seeded(spec.id);
	const answer = legal[Math.floor(random() * legal.length)];
	// squares a queen or knight would reach from here on an empty board, minus the real ones and own pieces
	const near = [...lines(spec.square), ...jumps(spec.square)].filter(
		(square) => !legal.includes(square) && game.get(square as Square)?.color !== piece.color && square !== spec.square,
	);
	const wrong = [...new Set(near)].sort(() => random() - 0.5).slice(0, 3);
	const name = PIECE_NAMES[piece.type];
	return {
		id: spec.id,
		rating: spec.rating,
		topic: 'moves',
		fen: spec.fen,
		side: piece.color === 'w' ? 'white' : 'black',
		question: `Which square can the ${name} on {square} move to?`,
		vars: { square: spec.square },
		literal: true,
		explain: PIECE_RULES[piece.type],
		marks: [spec.square],
		reveal: legal,
		...shuffled(spec.id, [answer, ...wrong].map((label) => ({ label }))),
	};
}

function materialItem(spec: (typeof MATERIAL)[number]): BasicsItem {
	const game = new Chess(spec.fen);
	let diff = 0;
	for (const row of game.board()) for (const cell of row) if (cell) diff += (cell.color === 'w' ? 1 : -1) * VALUES[cell.type];
	const ahead = (side: Side, count: number): BasicsChoice => ({
		label: side === 'white' ? 'White is ahead by {count} point|White is ahead by {count} points' : 'Black is ahead by {count} point|Black is ahead by {count} points',
		vars: { count },
	});
	const equal: BasicsChoice = { label: 'Material is equal' };
	const side: Side = diff > 0 ? 'white' : 'black';
	const other: Side = diff > 0 ? 'black' : 'white';
	const count = Math.abs(diff);
	const choices = diff ? [ahead(side, count), ahead(other, count), ahead(side, count + 2), equal] : [equal, ahead('white', 1), ahead('black', 1), ahead('white', 3)];
	return {
		id: spec.id,
		rating: spec.rating,
		topic: 'values',
		fen: spec.fen,
		side: 'white',
		question: 'Count the material. Who is ahead?',
		literal: false,
		explain: 'Pawn 1, knight 3, bishop 3, rook 5, queen 9. Add up each side’s pieces and compare.',
		...shuffled(spec.id, choices),
	};
}

function writeItem(spec: (typeof WRITE)[number]): BasicsItem {
	const game = new Chess(spec.fen);
	const [from, to, promotion] = [spec.move.slice(0, 2), spec.move.slice(2, 4), spec.move[4]];
	const san = game.move({ from, to, promotion }).san;
	const wrong = spec.wrong.filter((label) => label !== san);
	return {
		id: spec.id,
		rating: spec.rating,
		topic: 'notation',
		fen: spec.fen,
		side: sideOf(spec.fen),
		question: 'How is the move on the arrow written?',
		literal: true,
		explain: spec.explain,
		arrow: { from, to },
		...shuffled(spec.id, [san, ...wrong].map((label) => ({ label }))),
	};
}

/** Puts the first (right) choice at a place fixed by the id. */
function shuffled(id: string, choices: BasicsChoice[]): { choices: BasicsChoice[]; answer: number } {
	const random = seeded(`${id}-order`);
	const order = choices.map((choice, index) => ({ choice, index, key: random() })).sort((a, b) => a.key - b.key);
	return { choices: order.map((entry) => entry.choice), answer: order.findIndex((entry) => entry.index === 0) };
}

/** A repeatable random number generator per text (mulberry32 over a string hash). */
function seeded(text: string): () => number {
	let seed = 0;
	for (const char of text) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) | 0;
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function sideOf(fen: string): Side {
	return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** Squares on the straight lines and diagonals from `square`, on an empty board. */
function lines(square: string): string[] {
	const [file, rank] = [square.charCodeAt(0) - 97, Number(square[1]) - 1];
	const out: string[] = [];
	for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
		for (let f = file + df, r = rank + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) out.push(String.fromCharCode(97 + f) + (r + 1));
	}
	return out;
}

/** Knight jumps from `square`. */
function jumps(square: string): string[] {
	const [file, rank] = [square.charCodeAt(0) - 97, Number(square[1]) - 1];
	return [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
		.map(([df, dr]) => [file + df, rank + dr])
		.filter(([f, r]) => f >= 0 && f < 8 && r >= 0 && r < 8)
		.map(([f, r]) => String.fromCharCode(97 + f) + (r + 1));
}
