import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { MATE_CP } from '../pgn/parse.ts';

export interface EngineLine {
	/** Side to move's point of view; mates folded into ±(MATE_CP − moves). */
	cp: number;
	/** Moves to mate, side to move's point of view; null when not a mate score. */
	mate: number | null;
	depth: number;
	pv: string[];
}

export interface SearchRequest {
	fen: string;
	depth: number;
	multiPv: number;
	/** Restrict the search to these root moves (UCI). */
	searchMoves?: string[];
}

export interface EngineOptions {
	threads: number;
	hash: number;
}

/** One UCI engine process: a native Stockfish binary, or the npm .js build run through node. */
export class UciEngine {
	private readonly _process: ChildProcessWithoutNullStreams;
	private _buffer = '';
	private _listener: ((line: string) => void) | null = null;
	private _failure: ((error: Error) => void) | null = null;
	private _multiPv = 0;
	private _exited = false;

	private constructor(path: string) {
		const isScript = /\.(c|m)?js$/.test(path);
		this._process = spawn(isScript ? process.execPath : path, isScript ? [path] : [], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		this._process.stdout.setEncoding('utf8');
		this._process.stdout.on('data', (data: string) => this._onData(data));
		this._process.stderr.resume();
		this._process.stdin.on('error', () => undefined);
		this._process.on('exit', (code) => {
			this._exited = true;
			this._failure?.(new Error(`engine exited (code ${code})`));
		});
		this._process.on('error', (error) => {
			this._exited = true;
			this._failure?.(error);
		});
	}

	static async start(path: string, options: EngineOptions): Promise<UciEngine> {
		const engine = new UciEngine(path);
		await engine._until('uci', (line) => line === 'uciok', 30_000);
		engine._send(`setoption name Threads value ${options.threads}`);
		engine._send(`setoption name Hash value ${options.hash}`);
		await engine._until('isready', (line) => line === 'readyok', 30_000);
		return engine;
	}

	get alive(): boolean {
		return !this._exited;
	}

	/** Searches to a fixed depth; lines come back best first, scores from the side to move. */
	async search(request: SearchRequest, timeoutMs: number): Promise<EngineLine[]> {
		if (request.multiPv !== this._multiPv) {
			this._send(`setoption name MultiPV value ${request.multiPv}`);
			this._multiPv = request.multiPv;
		}
		// a fresh hash per search: fixed-depth results then don't depend on what this process searched before
		this._send('ucinewgame');
		this._send(`position fen ${request.fen}`);
		const go = `go depth ${request.depth}` + (request.searchMoves?.length ? ` searchmoves ${request.searchMoves.join(' ')}` : '');
		const byRank = new Map<number, EngineLine>();
		await this._until(
			go,
			(line) => {
				if (line.startsWith('info ')) {
					const parsed = parseInfo(line);
					if (parsed) byRank.set(parsed.rank, parsed.line);
				}
				return line.startsWith('bestmove');
			},
			timeoutMs,
		);
		return [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line);
	}

	quit(): void {
		if (this._exited) return;
		this._send('quit');
		setTimeout(() => this._exited || this._process.kill(), 2000).unref();
	}

	kill(): void {
		if (!this._exited) this._process.kill();
	}

	private _send(command: string): void {
		if (!this._exited) this._process.stdin.write(`${command}\n`);
	}

	private _onData(data: string): void {
		this._buffer += data;
		let index: number;
		while ((index = this._buffer.indexOf('\n')) >= 0) {
			const line = this._buffer.slice(0, index).trim();
			this._buffer = this._buffer.slice(index + 1);
			if (line) this._listener?.(line);
		}
	}

	/** Sends `command` and resolves once a line satisfies `done`. */
	private _until(command: string, done: (line: string) => boolean, timeoutMs: number): Promise<void> {
		if (this._exited) return Promise.reject(new Error('engine is not running'));
		return new Promise((resolve, reject) => {
			const finish = (error?: Error) => {
				clearTimeout(timer);
				this._listener = null;
				this._failure = null;
				if (error) reject(error);
				else resolve();
			};
			const timer = setTimeout(() => {
				this.kill();
				finish(new Error(`engine timed out on: ${command}`));
			}, timeoutMs);
			this._listener = (line) => {
				if (done(line)) finish();
			};
			this._failure = finish;
			this._send(command);
		});
	}
}

/** One `info ... multipv N ... score ... pv ...` line; bounds and lines without a pv are ignored. */
export function parseInfo(line: string): { rank: number; line: EngineLine } | null {
	const tokens = line.split(' ');
	let depth = 0;
	let rank = 1;
	let cp: number | null = null;
	let mate: number | null = null;
	let pvAt = -1;
	for (let i = 1; i < tokens.length; i++) {
		switch (tokens[i]) {
			case 'depth':
				depth = Number(tokens[++i]);
				break;
			case 'multipv':
				rank = Number(tokens[++i]);
				break;
			case 'score':
				if (tokens[i + 1] === 'cp') cp = Number(tokens[i + 2]);
				else if (tokens[i + 1] === 'mate') mate = Number(tokens[i + 2]);
				i += 2;
				break;
			case 'upperbound':
			case 'lowerbound':
			case 'currmove':
				return null;
			case 'pv':
				pvAt = i + 1;
				i = tokens.length;
				break;
		}
	}
	if (pvAt < 0 || pvAt >= tokens.length || (cp === null && mate === null)) return null;
	const score = mate !== null ? Math.sign(mate || -1) * (MATE_CP - Math.abs(mate)) : (cp as number);
	return { rank, line: { cp: score, mate, depth, pv: tokens.slice(pvAt) } };
}
