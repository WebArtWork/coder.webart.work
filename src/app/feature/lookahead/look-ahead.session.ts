import { computed, signal } from '@angular/core';
import { Chess } from 'chess.js';
import { sameMove, uciToSans } from '../chess/chess.util';
import { LookAheadItem, LookAheadMove } from '../game/game.interface';

export type LookAheadStatus = 'playing' | 'replying' | 'checked' | 'done';

/** One line through the tree: your moves with the replies in between. */
export interface LookAheadPath {
	/** Your moves joined, identifies the path. */
	key: string;
	/** Every ply from the start position, UCI. */
	uci: string[];
	san: string[];
}

/** How the last attempt went, shown until the next one starts. */
export type LookAheadVerdict =
	| { kind: 'found'; path: LookAheadPath }
	| { kind: 'again'; path: LookAheadPath }
	| { kind: 'miss'; san: string[] };

const REPLY_DELAY_MS = 450;
/** Time to see the last move before the board goes back to the start. */
const RESET_DELAY_MS = 1100;
const REPLAY_STEP_MS = 650;

/**
 * Look Ahead: find the lines through a tree of good moves. You play up to three moves, the
 * opponent's best replies are played for you; a whole line found or a move outside the tree
 * ends the attempt and the board goes back to the start.
 */
export class LookAheadSession {
	readonly paths: LookAheadPath[];
	readonly fen = signal('');
	readonly status = signal<LookAheadStatus>('playing');
	readonly lastMove = signal<{ from: string; to: string } | null>(null);
	/** SAN of this attempt so far. */
	readonly played = signal<string[]>([]);
	readonly verdict = signal<LookAheadVerdict | null>(null);
	readonly found = signal<ReadonlySet<string>>(new Set());
	readonly misses = signal(0);
	/** Remaining paths shown without being found. */
	readonly revealed = signal(false);

	/** Your move number in this attempt, from 1. */
	readonly step = computed(() => Math.ceil((this.played().length + 1) / 2));
	readonly done = computed(() => this.status() === 'done');
	readonly interactive = computed(() => this.status() === 'playing');

	private _nodes: LookAheadMove[];
	/** UCI of this attempt so far. */
	private _moves: string[] = [];
	private _timer: ReturnType<typeof setTimeout> | null = null;

	constructor(readonly item: LookAheadItem) {
		this.paths = collectPaths(item.fen, item.tree);
		this._nodes = item.tree;
		this.fen.set(item.fen);
	}

	/** Returns false when the move is illegal or no move is expected. */
	submitMove(from: string, to: string, promotion?: string): boolean {
		if (this.status() !== 'playing') return false;
		const node = this._nodes.find((candidate) => sameMove(candidate.move, from, to, promotion));
		const san = this._play(node?.move ?? `${from}${to}${promotion ?? ''}`);
		if (!san) return false;
		this.verdict.set(null);

		if (!node) {
			this.misses.update((count) => count + 1);
			this.verdict.set({ kind: 'miss', san: this.played() });
			this._endAttempt();
			return true;
		}
		const { reply, next } = node;
		const finish = () => {
			if (next.length) {
				this._nodes = next;
				this.status.set('playing');
			} else {
				this._complete();
			}
		};
		if (!reply) {
			finish();
			return true;
		}
		this.status.set('replying');
		this._later(REPLY_DELAY_MS, () => {
			this._play(reply);
			finish();
		});
		return true;
	}

	/** Ends the session and lists every path. */
	reveal() {
		this._clearTimer();
		this.revealed.set(true);
		this._toStart();
		this.status.set('done');
	}

	/** Plays a path out on the board, once the session is over. */
	replay(path: LookAheadPath) {
		if (this.status() !== 'done') return;
		this._clearTimer();
		this._toStart();
		const step = (i: number) => {
			if (i >= path.uci.length) return;
			this._later(REPLAY_STEP_MS, () => {
				this._play(path.uci[i]);
				step(i + 1);
			});
		};
		step(0);
	}

	/** Cancels pending moves; call when the session is thrown away. */
	dispose() {
		this._clearTimer();
	}

	private _complete() {
		const key = this._attemptKey();
		const path = this.paths.find((candidate) => candidate.key === key)!;
		const again = this.found().has(key);
		if (!again) this.found.update((found) => new Set([...found, key]));
		this.verdict.set({ kind: again ? 'again' : 'found', path });
		if (this.found().size === this.paths.length) {
			this._later(RESET_DELAY_MS, () => {
				this._toStart();
				this.status.set('done');
			});
			this.status.set('checked');
			return;
		}
		this._endAttempt();
	}

	private _endAttempt() {
		this.status.set('checked');
		this._later(RESET_DELAY_MS, () => {
			this._toStart();
			this.status.set('playing');
		});
	}

	private _toStart() {
		this._nodes = this.item.tree;
		this.fen.set(this.item.fen);
		this.lastMove.set(null);
		this.played.set([]);
		this._moves = [];
	}

	/** Your moves of this attempt joined, as in `LookAheadPath.key`. */
	private _attemptKey(): string {
		return this._moves.filter((_, i) => i % 2 === 0).join(' ');
	}

	/** Plays a move on the board; returns its SAN, or null when illegal. */
	private _play(uci: string): string | null {
		const chess = new Chess(this.fen());
		try {
			const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
			this._moves.push(uci);
			this.fen.set(chess.fen());
			this.lastMove.set({ from: move.from, to: move.to });
			this.played.update((list) => [...list, move.san]);
			return move.san;
		} catch {
			return null;
		}
	}

	private _later(ms: number, work: () => void) {
		this._clearTimer();
		this._timer = setTimeout(() => {
			this._timer = null;
			work();
		}, ms);
	}

	private _clearTimer() {
		if (this._timer) clearTimeout(this._timer);
		this._timer = null;
	}
}

/** Every root-to-leaf line of the tree, with SAN. */
function collectPaths(fen: string, tree: LookAheadMove[]): LookAheadPath[] {
	const paths: LookAheadPath[] = [];
	const walk = (nodes: LookAheadMove[], uci: string[], mine: string[]) => {
		for (const node of nodes) {
			const line = node.reply ? [...uci, node.move, node.reply] : [...uci, node.move];
			const moves = [...mine, node.move];
			if (node.next.length) walk(node.next, line, moves);
			else paths.push({ key: moves.join(' '), uci: line, san: uciToSans(fen, line) });
		}
	};
	walk(tree, [], []);
	return paths;
}
