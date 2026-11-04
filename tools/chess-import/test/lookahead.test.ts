import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { countPaths, lookAheadTree, MAX_PATHS, type Analyse } from '../src/analysis/lookahead.ts';
import type { EngineLine } from '../src/engine/uci.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A fake engine: for the side to move, `good` legal moves score 0 and the rest -300; replies are the first legal move. */
function engine(good: (ply: number) => number): Analyse {
	return async (fen) => {
		const chess = new Chess(fen);
		const ply = (Number(fen.split(' ')[5]) - 1) * 2 + (chess.turn() === 'b' ? 1 : 0);
		const moves = chess.moves({ verbose: true }).slice(0, 5);
		return moves.map((move, i): EngineLine => {
			const after = new Chess(fen);
			after.move(move.lan);
			const reply = after.moves({ verbose: true })[0]?.lan;
			return { cp: i < good(ply) ? 0 : -300, mate: null, depth: 16, pv: reply ? [move.lan, reply] : [move.lan] };
		});
	};
}

describe('Look Ahead tree', () => {
	it('branches on every good move, three moves deep', async () => {
		// 2 good moves at the root, 1 after, then 2: 2 × 1 × 2 = 4 paths
		const tree = await lookAheadTree(START, engine((ply) => [2, 0, 1, 0, 2][ply]), 50);
		expect(tree).not.toBeNull();
		expect(tree!.length).toBe(2);
		expect(countPaths(tree!)).toBe(4);
		for (const node of tree!) {
			expect(node.reply).not.toBeNull();
			expect(node.next.length).toBe(1);
			expect(node.next[0].next.every((leaf) => leaf.reply === null && leaf.next.length === 0)).toBe(true);
		}
	});

	it('skips a single line', async () => {
		expect(await lookAheadTree(START, engine(() => 1), 50)).toBeNull();
	});

	it('skips a bushy tree rather than cutting it', async () => {
		expect(await lookAheadTree(START, engine(() => 4), 50)).toBeNull();
		// 3 × 3 = 9 paths after two moves: over the limit
		expect(MAX_PATHS).toBeLessThan(9);
		expect(await lookAheadTree(START, engine(() => 3), 50)).toBeNull();
	});
});
