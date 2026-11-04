import { fenKey } from '../chess/board.ts';
import { UciEngine, type EngineLine, type EngineOptions, type SearchRequest } from './uci.ts';

export interface EngineCache {
	get(key: string, multiPv: number, depth: number): EngineLine[] | null;
	put(key: string, multiPv: number, depth: number, lines: EngineLine[]): void;
}

export interface PoolStats {
	searches: number;
	cacheHits: number;
	restarts: number;
}

interface Task {
	request: SearchRequest;
	resolve: (lines: EngineLine[]) => void;
	reject: (error: Error) => void;
	attempts: number;
}

/** A fixed number of single-threaded engine processes fed from one queue, with a position cache. */
export class EnginePool {
	readonly stats: PoolStats = { searches: 0, cacheHits: 0, restarts: 0 };
	private readonly _engines: (UciEngine | null)[];
	private readonly _busy: boolean[];
	private readonly _queue: Task[] = [];
	private readonly _path: string;
	private readonly _options: EngineOptions;
	private readonly _cache: EngineCache | null;
	private _closed = false;

	constructor(path: string, size: number, options: EngineOptions, cache: EngineCache | null = null) {
		this._path = path;
		this._options = options;
		this._cache = cache;
		this._engines = Array.from({ length: Math.max(1, size) }, () => null);
		this._busy = this._engines.map(() => false);
	}

	/** Lines best first, scores from the side to move. Cached by position, line count and depth. */
	analyse(request: SearchRequest): Promise<EngineLine[]> {
		const key = cacheKey(request);
		const cached = this._cache?.get(key, request.multiPv, request.depth);
		if (cached) {
			this.stats.cacheHits++;
			return Promise.resolve(cached.slice(0, request.multiPv));
		}
		return new Promise<EngineLine[]>((resolve, reject) => {
			this._queue.push({ request, resolve, reject, attempts: 0 });
			this._pump();
		}).then((lines) => {
			this._cache?.put(key, request.multiPv, request.depth, lines);
			return lines;
		});
	}

	close(): void {
		this._closed = true;
		for (const task of this._queue.splice(0)) task.reject(new Error('engine pool closed'));
		for (const engine of this._engines) engine?.quit();
	}

	private _pump(): void {
		for (let i = 0; i < this._engines.length && this._queue.length && !this._closed; i++) {
			if (this._busy[i]) continue;
			const task = this._queue.shift() as Task;
			this._busy[i] = true;
			this._run(i, task).finally(() => {
				this._busy[i] = false;
				this._pump();
			});
		}
	}

	private async _run(slot: number, task: Task): Promise<void> {
		try {
			let engine = this._engines[slot];
			if (!engine || !engine.alive) {
				if (engine) this.stats.restarts++;
				engine = await UciEngine.start(this._path, this._options);
				this._engines[slot] = engine;
			}
			const timeout = 60_000 + task.request.depth * task.request.multiPv * 4_000;
			const lines = await engine.search(task.request, timeout);
			this.stats.searches++;
			task.resolve(lines);
		} catch (error) {
			this._engines[slot]?.kill();
			this._engines[slot] = null;
			if (++task.attempts < 2 && !this._closed) this._queue.unshift(task);
			else task.reject(error as Error);
		}
	}
}

function cacheKey(request: SearchRequest): string {
	const moves = request.searchMoves?.length ? ` | ${[...request.searchMoves].sort().join(',')}` : '';
	return fenKey(request.fen) + moves;
}
