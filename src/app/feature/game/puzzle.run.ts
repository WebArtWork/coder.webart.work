import { computed, Signal } from '@angular/core';
import { BoardArrow } from '../../components/board/board.component';
import { Analysis } from '../chess/analysis';
import { Candidate, TopMove } from '../chess/chess.interface';
import { EngineService } from '../chess/engine.service';
import { GameSession } from '../chess/game.session';
import { LineSession } from '../chess/line.session';
import { I18nVars } from '../i18n/i18n.service';
import { PuzzleData } from './game.interface';
import { lineEval, topMovesFromLines } from './game.util';

/** Evaluates guesses that are not among the stored engine lines. */
const GO = 'go depth 12';
const STRIKES = { best: 3, candidates: 5, line: 3 } as const;

/** What a finished puzzle leaves behind, e.g. for the daily record. */
export interface PuzzleResult {
	hits: number;
	target: number;
	won: boolean;
	squares: string[];
	candidates: Candidate[];
	answers: TopMove[];
}

/** A text to show, in English with its placeholders; translated where it is rendered. */
export interface RunMessage {
	text: string;
	vars?: I18nVars;
}

/**
 * One attempt at a puzzle, whatever its exercise: the best move and good-moves puzzles run a
 * `GameSession` over the stored engine lines, play-the-line puzzles a `LineSession`.
 */
export class PuzzleRun {
	readonly moves: GameSession | null = null;
	readonly line: LineSession | null = null;
	readonly topMoves: TopMove[];

	readonly fen: Signal<string>;
	readonly done: Signal<boolean>;
	readonly won: Signal<boolean>;
	readonly interactive: Signal<boolean>;
	readonly lastMove: Signal<{ from: string; to: string } | null>;
	readonly arrows: Signal<BoardArrow[]>;
	readonly strikes: Signal<number>;
	readonly maxStrikes: number;
	/** The outcome once finished, e.g. "Solved" or "Out of strikes"; null while playing. */
	readonly outcome: Signal<RunMessage | null>;

	constructor(
		readonly puzzle: PuzzleData,
		engine: EngineService,
		/** Puzzle practice rules: one answer, played move by move; the first wrong move fails. */
		readonly strict = false,
	) {
		this.topMoves = topMovesFromLines(puzzle.fen, puzzle.lines);
		if (puzzle.mode === 'line' || strict) {
			const solution = puzzle.mode === 'line' ? puzzle.solution : [puzzle.lines[0].uci.split(' ')[0]];
			const strikes = strict ? 1 : STRIKES.line;
			// puzzle practice rules, like chess.com: besides the solution only another mate counts
			const line = new LineSession(puzzle.fen, solution, lineEval(puzzle.lines[0]), engine, GO, strikes, !strict);
			this.line = line;
			this.fen = line.fen;
			this.done = line.done;
			this.won = line.won;
			this.interactive = computed(() => line.status() === 'playing');
			this.lastMove = line.lastMove;
			this.strikes = line.strikes;
			this.maxStrikes = line.maxStrikes;
			this.outcome = computed(() => {
				if (!line.done()) return null;
				if (!line.won()) return { text: 'Out of strikes' };
				const alternative = line.alternative();
				return alternative ? { text: 'Solved: {move} works too', vars: { move: alternative } } : { text: 'Solved' };
			});
			this.arrows = computed(() => {
				if (line.status() !== 'lost') return [];
				// show the move that was missed
				const next = line.solution[line.played().length];
				return next ? [arrow(next, 'green')] : [];
			});
		} else {
			const analysis = new Analysis(puzzle.fen, engine, GO, this.topMoves);
			const session = new GameSession(analysis, puzzle.side, puzzle.target, STRIKES[puzzle.mode]);
			this.moves = session;
			this.fen = computed(() => puzzle.fen);
			this.done = session.done;
			this.won = session.won;
			this.interactive = computed(() => !session.done());
			this.lastMove = computed(() => null);
			this.strikes = session.strikes;
			this.maxStrikes = session.maxStrikes;
			this.outcome = computed(() => {
				if (!session.done()) return null;
				if (!session.won()) return { text: 'Out of strikes' };
				const count = session.targetMoves();
				return count === 1 ? { text: 'Solved' } : { text: 'All {count} found', vars: { count } };
			});
			this.arrows = computed(() => {
				if (!session.done()) return [];
				return [
					...session.answers().map((move) => arrow(move.move, 'green')),
					...session
						.candidates()
						.filter((candidate) => candidate.status === 'miss')
						.map((candidate) => arrow(candidate.move, 'red')),
				];
			});
		}
	}

	submit(from: string, to: string, promotion?: string) {
		if (this.line) this.line.submitMove(from, to, promotion);
		else this.moves?.submitMove(from, to, promotion);
	}

	result(): PuzzleResult {
		if (this.moves) {
			return {
				hits: this.moves.hits(),
				target: this.moves.targetMoves(),
				won: this.moves.won(),
				squares: this.moves.squares(),
				candidates: this.moves.candidates(),
				answers: this.moves.answers(),
			};
		}
		const line = this.line!;
		const best = this.topMoves[0];
		// the solution's own moves, as answers
		const answers = line.solution
			.map((uci, i) => ({ uci, san: line.solutionSans[i] }))
			.filter((_, i) => i % 2 === 0)
			.map(({ uci, san }) => ({ ...best, move: uci, san: san ?? uci }));
		return {
			hits: line.found(),
			target: line.target,
			won: line.won(),
			squares: line.squares(),
			candidates: [],
			answers,
		};
	}

	/** For the rating, 0 to 1: the share of good moves found, or 1 for solved cleanly, ½ after a strike. */
	score(): number {
		if (this.moves && this.puzzle.mode === 'candidates') {
			const target = this.moves.targetMoves();
			return target > 0 ? Math.min(1, this.moves.hits() / target) : 0;
		}
		if (!this.won()) return 0;
		return this.strikes() ? 0.5 : 1;
	}

	dispose() {
		this.line?.dispose();
	}
}

function arrow(uci: string, brush: BoardArrow['brush']): BoardArrow {
	return { from: uci.slice(0, 2), to: uci.slice(2, 4), brush };
}
