import { computed, signal } from '@angular/core';
import { Chess } from 'chess.js';
import { evalToWinPercent, isBlackToMove, sameMove, uciToSans } from './chess.util';
import { EngineService } from './engine.service';

export type LineStatus = 'playing' | 'checking' | 'replying' | 'won' | 'lost';

export interface LineMove {
	san: string;
	uci: string;
	by: 'you' | 'reply';
}

/** A move counts as good enough when it keeps the win chance within this many points of the line. */
const ALTERNATIVE_DROP = 3;
const REPLY_DELAY_MS = 450;

/**
 * Play-the-line exercise: make each move of the solution; the opponent's forced replies are
 * played for you. A different move that the engine rates as good as the line also solves it.
 */
export class LineSession {
	readonly fen = signal('');
	readonly status = signal<LineStatus>('playing');
	readonly played = signal<LineMove[]>([]);
	readonly misses = signal<LineMove[]>([]);
	/** SAN of a different move that was accepted as just as good, if any. */
	readonly alternative = signal<string | null>(null);
	readonly lastMove = signal<{ from: string; to: string } | null>(null);

	readonly solutionSans: string[];
	/** Your moves in the solution. */
	readonly target: number;
	readonly found = computed(() => this.played().filter((move) => move.by === 'you').length);
	readonly strikes = computed(() => this.misses().length);
	readonly done = computed(() => this.status() === 'won' || this.status() === 'lost');
	readonly won = computed(() => this.status() === 'won');
	readonly squares = computed(() => [
		...this.played()
			.filter((move) => move.by === 'you')
			.map(() => '✅'),
		...this.misses().map(() => '❌'),
	]);

	private _step = 0;
	private _timer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		readonly startFen: string,
		readonly solution: string[],
		/** The line's score, White's point of view in pawns. */
		private readonly _expectedEval: number,
		private readonly _engine: EngineService,
		private readonly _go: string,
		readonly maxStrikes = 3,
		/** Accept a different move the engine rates as good as the line; when false, only a different mate counts. */
		private readonly _acceptEqual = true,
	) {
		this.fen.set(startFen);
		this.solutionSans = uciToSans(startFen, solution);
		this.target = Math.ceil(solution.length / 2);
	}

	/** Returns false when the move is illegal or the session is not waiting for a move. */
	submitMove(from: string, to: string, promotion?: string): boolean {
		if (this.status() !== 'playing') return false;
		const expected = this.solution[this._step];
		if (expected && sameMove(expected, from, to, promotion)) {
			this._play(expected, 'you');
			this._afterYourMove();
			return true;
		}

		let san: string;
		const before = this.fen();
		try {
			san = new Chess(before).move({ from, to, promotion: promotion ?? 'q' }).san;
		} catch {
			return false;
		}
		const uci = `${from}${to}${promotion ?? ''}`;
		if (this.misses().some((move) => move.uci === uci)) return false;
		this.status.set('checking');
		void this._checkAlternative(before, uci, san);
		return true;
	}

	/** Cancels a pending reply; call when the session is thrown away. */
	dispose() {
		if (this._timer) clearTimeout(this._timer);
	}

	private async _checkAlternative(fen: string, uci: string, san: string) {
		const chess = new Chess(fen);
		chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
		let good = chess.isCheckmate();
		if (!good && this._acceptEqual) {
			const sign = isBlackToMove(fen) ? -1 : 1;
			const result = await this._engine.evaluateMove(fen, uci, this._go);
			const drop = evalToWinPercent(sign * this._expectedEval) - evalToWinPercent(sign * result.eval);
			good = drop <= ALTERNATIVE_DROP;
		}
		if (this.status() !== 'checking') return;
		if (good) {
			this._play(uci, 'you', san);
			this.alternative.set(san);
			this.status.set('won');
			return;
		}
		this.misses.update((list) => [...list, { san, uci, by: 'you' }]);
		this.status.set(this.strikes() >= this.maxStrikes ? 'lost' : 'playing');
	}

	private _afterYourMove() {
		if (this._step >= this.solution.length) {
			this.status.set('won');
			return;
		}
		this.status.set('replying');
		this._timer = setTimeout(() => {
			this._timer = null;
			this._play(this.solution[this._step], 'reply');
			this.status.set(this._step >= this.solution.length ? 'won' : 'playing');
		}, REPLY_DELAY_MS);
	}

	private _play(uci: string, by: LineMove['by'], san?: string) {
		const chess = new Chess(this.fen());
		const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
		this.fen.set(chess.fen());
		this.lastMove.set({ from: move.from, to: move.to });
		this.played.update((list) => [...list, { san: san ?? move.san, uci, by }]);
		this._step++;
	}
}
