import { Chess } from 'chess.js';
import type { EngineLine } from '../engine/uci.ts';

/**
 * Look Ahead trees: from a position, every good move of the side to move, the opponent's best
 * reply to it, and again the good moves after that, down to `LOOK_AHEAD_DEPTH` moves of yours.
 * Each path from the root to a leaf is one line the player has to find.
 */

/** Your moves per path. */
export const LOOK_AHEAD_DEPTH = 3;
/** A node with more good moves than this makes the tree too bushy: the position is skipped, not cut. */
export const MAX_BRANCH = 3;
/** Paths a tree needs: fewer is a plain line puzzle, more is a chore. */
export const MIN_PATHS = 2;
export const MAX_PATHS = 8;

export interface LookAheadMove {
	/** Your move, UCI. */
	move: string;
	/** The opponent's best reply, UCI; null on your last move or when the game is over. */
	reply: string | null;
	/** Your good moves after the reply; empty at the end of a path. */
	next: LookAheadMove[];
}

/** Engine lines for a position, best first, scores from the side to move (see `EnginePool.analyse`). */
export type Analyse = (fen: string) => Promise<EngineLine[]>;

/**
 * The tree of good moves from `fen`, or null when it has too many branches or too few or too
 * many paths. Moves within `goodLoss` centipawns of the best one count as good, as in the
 * good-moves puzzles.
 */
export async function lookAheadTree(fen: string, analyse: Analyse, goodLoss: number): Promise<LookAheadMove[] | null> {
	// paths so far: each expanded node turns into its children, so the count only grows
	const count = { paths: 1 };
	const expand = async (position: string, level: number): Promise<LookAheadMove[] | null> => {
		const lines = (await analyse(position)).filter((line) => line.pv.length);
		if (!lines.length) return null;
		const good = lines.filter((line) => lines[0].cp - line.cp <= goodLoss);
		if (good.length > MAX_BRANCH) return null;
		count.paths += good.length - 1;
		if (count.paths > MAX_PATHS) return null;

		const nodes: LookAheadMove[] = [];
		for (const line of good) {
			const node: LookAheadMove = { move: line.pv[0], reply: null, next: [] };
			nodes.push(node);
			if (level === LOOK_AHEAD_DEPTH) continue;
			const chess = new Chess(position);
			play(chess, node.move);
			if (chess.isGameOver()) continue;
			const reply = line.pv[1] ?? (await analyse(chess.fen()))[0]?.pv[0];
			if (!reply) continue;
			play(chess, reply);
			node.reply = reply;
			if (chess.isGameOver()) continue;
			const next = await expand(chess.fen(), level + 1);
			if (!next) return null;
			node.next = next;
		}
		return nodes;
	};
	const tree = await expand(fen, 1);
	return tree && count.paths >= MIN_PATHS ? tree : null;
}

/** Leaves of the tree: the paths to find. */
export function countPaths(tree: LookAheadMove[]): number {
	return tree.reduce((total, node) => total + (node.next.length ? countPaths(node.next) : 1), 0);
}

function play(chess: Chess, uci: string) {
	chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}
