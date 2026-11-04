import { computed, signal, Signal } from '@angular/core';
import { Chess } from 'chess.js';
import { Analysis } from './analysis';
import { Candidate, Side, TopMove } from './chess.interface';
import { isBlackToMove } from './chess.util';

export const RANK_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

/**
 * One round of the candidate game: find the top N engine moves
 * before collecting `maxStrikes` strikes.
 */
export class GameSession {
	readonly candidates = signal<Candidate[]>([]);
	readonly targetMoves = signal(5);
	readonly topMoves: Signal<TopMove[]>;
	readonly ready: Signal<boolean>;

	readonly hits = computed(() => this.candidates().filter((c) => c.status === 'hit').length);
	readonly strikes = computed(() => this.candidates().filter((c) => c.status === 'miss').length);
	readonly done = computed(
		() => this.strikes() >= this.maxStrikes || this.hits() >= this.targetMoves(),
	);
	readonly answers = computed(() =>
		this.done() ? this.topMoves().slice(0, this.targetMoves()) : [],
	);
	readonly won = computed(() => this.hits() >= this.targetMoves());
	readonly squares = computed(() =>
		this.candidates()
			.filter((c) => c.status !== 'pending')
			.map((c) => {
				if (c.status === 'hidden_gem') return '💎';
				if (c.status !== 'hit') return '❌';
				const rank = this.rankOf(c.move);
				return rank && rank <= RANK_EMOJI.length ? RANK_EMOJI[rank - 1] : '🟩';
			}),
	);

	private _chain: Promise<void> = Promise.resolve();

	constructor(
		readonly analysis: Analysis,
		readonly orientation: Side,
		targetMoves = 5,
		readonly maxStrikes = 5,
	) {
		this.topMoves = analysis.topMoves;
		this.ready = analysis.ready;
		this.targetMoves.set(targetMoves);
		void analysis.ready$.then(() => {
			const available = analysis.topMoves().length;
			if (available > 0 && available < this.targetMoves()) this.targetMoves.set(available);
		});
	}

	get fen(): string {
		return this.analysis.fen;
	}

	rankOf(uci: string): number | null {
		const index = this.topMoves().findIndex((move) => move.move === uci);
		return index === -1 ? null : index + 1;
	}

	/** Returns false when the move is illegal or was already tried. */
	submitMove(from: string, to: string, promotion?: string): boolean {
		if (this.done()) return false;

		let san: string;
		try {
			san = new Chess(this.fen).move({ from, to, promotion: promotion ?? 'q' }).san;
		} catch {
			return false;
		}

		const uci = `${from}${to}${promotion ?? ''}`;
		if (this.candidates().some((c) => c.move === uci)) return false;

		this.candidates.update((list) => [...list, { move: uci, san, status: 'pending' }]);
		this._chain = this._chain.then(() => this._process(uci, san));
		return true;
	}

	private async _process(uci: string, san: string) {
		if (this.done()) {
			this.candidates.update((list) => list.filter((c) => c.move !== uci));
			return;
		}

		const evaluated = await this.analysis.evaluateMove(uci, san);
		const target = this.targetMoves();
		const isHit = evaluated.rank !== null && evaluated.rank <= target;

		let isHiddenGem = false;
		if (!isHit && evaluated.rank === null) {
			const floor = this.topMoves()[target - 1]?.rawEval ?? null;
			const black = isBlackToMove(this.fen);
			isHiddenGem = floor !== null && (black ? evaluated.eval < floor : evaluated.eval > floor);
		}

		this.candidates.update((list) =>
			list.map((c) =>
				c.move === uci
					? {
							move: uci,
							san: evaluated.san,
							status: isHit ? 'hit' : isHiddenGem ? 'hidden_gem' : 'miss',
							eval: evaluated.eval,
							diffBest: evaluated.diffBest,
							diffPos: evaluated.diffPos,
							category: evaluated.category,
							line: evaluated.line,
						}
					: c,
			),
		);
	}
}
