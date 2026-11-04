import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { Chess } from 'chess.js';
import { AnalysisSettings, PVLine, TopMove } from './chess.interface';
import { isBlackToMove, mateScore, uciToSans } from './chess.util';

const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js';

interface Job {
	commands: string[];
	onLine: (line: string) => void;
	done: () => void;
}

class EngineWorker {
	private readonly _worker: Worker;
	private readonly _queue: Job[] = [];
	private _running = false;

	constructor() {
		this._worker = new Worker(ENGINE_URL);
		this._worker.postMessage('uci');
		this._worker.postMessage('isready');
	}

	run(commands: string[], onLine: (line: string) => void): Promise<void> {
		return new Promise((resolve) => {
			this._queue.push({ commands, onLine, done: resolve });
			this._next();
		});
	}

	terminate() {
		this._worker.terminate();
	}

	private _next() {
		const job = this._queue[0];
		if (this._running || !job) return;
		this._running = true;

		const handler = (event: MessageEvent) => {
			if (typeof event.data !== 'string') return;
			const line = event.data.trim();
			job.onLine(line);
			if (line.startsWith('bestmove')) {
				this._worker.removeEventListener('message', handler);
				this._running = false;
				this._queue.shift();
				job.done();
				this._next();
			}
		};

		this._worker.addEventListener('message', handler);
		for (const command of job.commands) this._worker.postMessage(command);
	}
}

/** Stockfish in Web Workers. Browser only; every method is a no-op on the server. */
@Service()
export class EngineService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private _topWorker?: EngineWorker;
	private _moveWorker?: EngineWorker;

	goCommand(settings: Pick<AnalysisSettings, 'useMovetime' | 'movetime' | 'depth'>): string {
		return settings.useMovetime ? `go movetime ${settings.movetime}` : `go depth ${settings.depth}`;
	}

	/** Ranked candidate moves; rawEval is white-POV in pawns. */
	async getTopMoves(fen: string, count: number, go: string): Promise<TopMove[]> {
		if (!this._isBrowser) return [];
		this._topWorker ??= new EngineWorker();

		const targetDepth = Number(go.match(/depth (\d+)/)?.[1]) || null;
		const isBlack = isBlackToMove(fen);
		const results: Record<string, TopMove> = {};

		await this._topWorker.run(
			['stop', `setoption name MultiPV value ${count}`, `position fen ${fen}`, go],
			(line) => {
				if (!line.startsWith('info') || !line.includes('multipv')) return;
				const pv = line.match(/multipv (\d+)/)?.[1];
				const cp = line.match(/score cp (-?\d+)/)?.[1];
				const mate = line.match(/score mate (-?\d+)/)?.[1];
				const depth = Number(line.match(/depth (\d+)/)?.[1] ?? 0);
				const pvMoves = line.match(/ pv (.+)$/)?.[1];
				if (!pv || (cp === undefined && mate === undefined) || !pvMoves) return;
				if (targetDepth && depth !== targetDepth) return;

				const uciMoves = pvMoves.trim().split(' ');
				const sans = uciToSans(fen, uciMoves);
				const score = cp !== undefined ? Number(cp) / 100 : mateScore(Number(mate));
				results[pv] = {
					move: uciMoves[0],
					san: sans[0] ?? uciMoves[0],
					rawEval: isBlack ? -score : score,
					diffBest: 0,
					diffPos: 0,
					category: null,
					line: { moves: uciMoves, sans },
				};
			},
		);

		return Object.values(results).slice(0, count);
	}

	/** Evaluation after playing `uci` from `fen` (white-POV pawns) with the continuation. */
	async evaluateMove(
		fen: string,
		uci: string,
		go: string,
	): Promise<{ eval: number; line: PVLine }> {
		if (!this._isBrowser) return { eval: 0, line: { moves: [], sans: [] } };
		this._moveWorker ??= new EngineWorker();

		const game = new Chess(fen);
		game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
		const fenAfter = game.fen();
		let score: number | null = null;
		let line: PVLine = { moves: [], sans: [] };

		await this._moveWorker.run(['stop', `position fen ${fenAfter}`, go], (info) => {
			if (!info.startsWith('info')) return;
			const cp = info.match(/score cp (-?\d+)/)?.[1];
			const mate = info.match(/score mate (-?\d+)/)?.[1];
			const pv = info.match(/ pv (.+)$/)?.[1];
			if (cp !== undefined) score = Number(cp) / 100;
			else if (mate !== undefined) score = mateScore(Number(mate));
			if (pv) {
				const moves = pv.trim().split(' ');
				line = { moves, sans: uciToSans(fenAfter, moves) };
			}
		});

		// the score is from the opponent's point of view after the move
		const mover = score !== null ? -(score as number) : 0;
		return { eval: isBlackToMove(fen) ? -mover : mover, line };
	}

	destroy() {
		this._topWorker?.terminate();
		this._moveWorker?.terminate();
		this._topWorker = this._moveWorker = undefined;
	}
}
