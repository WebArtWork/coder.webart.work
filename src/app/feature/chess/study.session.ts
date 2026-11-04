import { computed, signal, Signal } from '@angular/core';
import { Chess } from 'chess.js';
import { Analysis } from './analysis';
import { Candidate, TopMove } from './chess.interface';

const MAX_CANDIDATES = 10;

export type StudyPhase = 'active' | 'comparing' | 'done';

/** Pick candidate moves freely, then let the engine grade and rank them. */
export class StudySession {
	readonly phase = signal<StudyPhase>('active');
	readonly candidates = signal<Candidate[]>([]);
	readonly topMoves = signal<TopMove[]>([]);
	readonly ready: Signal<boolean>;
	readonly minCandidates: number;
	readonly canCompare = computed(
		() =>
			this.phase() === 'active' &&
			this.ready() &&
			this.candidates().length >= this.minCandidates,
	);

	constructor(
		readonly analysis: Analysis,
		minCandidates: number,
		private readonly _topMoveCount: number,
	) {
		this.ready = analysis.ready;
		// never ask for more candidates than the position has legal moves
		this.minCandidates = Math.min(minCandidates, new Chess(analysis.fen).moves().length);
	}

	get fen(): string {
		return this.analysis.fen;
	}

	addCandidate(from: string, to: string, promotion?: string): boolean {
		if (this.phase() !== 'active' || this.candidates().length >= MAX_CANDIDATES) return false;

		let san: string;
		try {
			san = new Chess(this.fen).move({ from, to, promotion: promotion ?? 'q' }).san;
		} catch {
			return false;
		}

		const uci = `${from}${to}${promotion ?? ''}`;
		if (this.candidates().some((c) => c.move === uci)) return false;
		this.candidates.update((list) => [...list, { move: uci, san, status: 'pending' }]);
		return true;
	}

	removeCandidate(uci: string) {
		if (this.phase() !== 'active') return;
		this.candidates.update((list) => list.filter((c) => c.move !== uci));
	}

	async compare() {
		if (!this.canCompare()) return;
		this.phase.set('comparing');

		const evaluated: Candidate[] = [];
		for (const candidate of this.candidates()) {
			const result = await this.analysis.evaluateMove(candidate.move, candidate.san);
			evaluated.push({
				move: result.move,
				san: result.san,
				status: 'hit',
				eval: result.eval,
				diffBest: result.diffBest,
				diffPos: result.diffPos,
				category: result.category,
				line: result.line,
			});
		}

		evaluated.sort((a, b) => this._cmp(a, b));
		this.candidates.set(evaluated);
		this.topMoves.set(this.analysis.topMoves().slice(0, this._topMoveCount));
		this.phase.set('done');
	}

	/** Best first for the side to move. */
	private _cmp(a: Candidate, b: Candidate): number {
		const black = this.fen.includes(' b ');
		return black ? (a.eval ?? 0) - (b.eval ?? 0) : (b.eval ?? 0) - (a.eval ?? 0);
	}
}
