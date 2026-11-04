import { signal } from '@angular/core';
import { EvaluatedMove, TopMove } from './chess.interface';
import { enrichTopMoves, getMoveCategory, isBlackToMove } from './chess.util';
import { EngineService } from './engine.service';

const SEARCH_MOVES = 20;

/** Ranked engine moves for one locked position, plus on-demand evaluation of any move. */
export class Analysis {
	readonly topMoves = signal<TopMove[]>([]);
	readonly ready = signal(false);
	readonly ready$: Promise<void>;

	private _positionEval = 0;
	private _resolve!: () => void;

	constructor(
		readonly fen: string,
		private readonly _engine: EngineService,
		private readonly _go: string,
		/** Ranked moves known in advance (stored engine lines); the engine then only checks other moves. */
		precomputed?: TopMove[],
	) {
		this.ready$ = new Promise<void>((resolve) => (this._resolve = resolve));

		if (precomputed?.length) {
			this._finish(precomputed);
		} else {
			void this._engine
				.getTopMoves(fen, SEARCH_MOVES, _go)
				.then((moves) => this._finish(moves));
		}
	}

	get positionEval(): number {
		return this._positionEval;
	}

	async evaluateMove(uci: string, san: string): Promise<EvaluatedMove> {
		await this.ready$;
		const moves = this.topMoves();
		const best = moves[0]?.rawEval ?? 0;
		const rank = moves.findIndex((move) => move.move === uci);
		const known = rank === -1 ? null : moves[rank];

		let moveEval: number;
		let line: EvaluatedMove['line'];
		if (known) {
			moveEval = known.rawEval;
			line = known.line;
		} else {
			const result = await this._engine.evaluateMove(this.fen, uci, this._go);
			moveEval = result.eval;
			line = { moves: [uci, ...result.line.moves], sans: [san, ...result.line.sans] };
		}

		return {
			move: uci,
			san,
			eval: moveEval,
			rank: rank === -1 ? null : rank + 1,
			category: getMoveCategory(this._positionEval, moveEval, isBlackToMove(this.fen), best),
			diffBest: moveEval - best,
			diffPos: moveEval - this._positionEval,
			line,
		};
	}

	private _finish(moves: TopMove[]) {
		this._positionEval = moves[0]?.rawEval ?? 0;
		this.topMoves.set(enrichTopMoves(this.fen, moves, this._positionEval));
		this.ready.set(true);
		this._resolve();
	}
}
