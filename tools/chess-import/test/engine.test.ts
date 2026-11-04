import { afterAll, describe, expect, it } from 'vitest';
import { EnginePool, type EngineCache } from '../src/engine/pool.ts';
import { parseInfo, type EngineLine } from '../src/engine/uci.ts';
import { engineOrNull } from './helpers.ts';

describe('UCI output parsing', () => {
	it('reads depth, rank, centipawn score and pv', () => {
		const parsed = parseInfo('info depth 18 seldepth 25 multipv 2 score cp -35 nodes 1 nps 1 time 1 pv e2e4 e7e5');
		expect(parsed).toEqual({ rank: 2, line: { cp: -35, mate: null, depth: 18, pv: ['e2e4', 'e7e5'] } });
	});

	it('folds mate scores into the centipawn scale, nearer mates scoring higher', () => {
		const mateIn2 = parseInfo('info depth 9 multipv 1 score mate 2 pv a1a8')!.line;
		const mateIn5 = parseInfo('info depth 9 multipv 1 score mate 5 pv a1a8')!.line;
		const matedIn3 = parseInfo('info depth 9 multipv 1 score mate -3 pv a1a8')!.line;
		expect(mateIn2.mate).toBe(2);
		expect(mateIn2.cp).toBeGreaterThan(mateIn5.cp);
		expect(matedIn3.cp).toBeLessThan(-9000);
	});

	it('ignores bound scores and lines without a pv', () => {
		expect(parseInfo('info depth 12 multipv 1 score cp 20 upperbound pv e2e4')).toBeNull();
		expect(parseInfo('info depth 12 currmove e2e4 currmovenumber 1')).toBeNull();
	});
});

const engine = engineOrNull();

describe.skipIf(!engine)('Stockfish evaluation', () => {
	const stored = new Map<string, EngineLine[]>();
	const cache: EngineCache = {
		get: (key, multiPv, depth) => stored.get(`${key}|${multiPv}|${depth}`) ?? null,
		put: (key, multiPv, depth, lines) => void stored.set(`${key}|${multiPv}|${depth}`, lines),
	};
	const pool = new EnginePool(engine!, 2, { threads: 1, hash: 16 }, cache);
	afterAll(() => pool.close());

	it('finds a back-rank mate in one', async () => {
		const lines = await pool.analyse({ fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', depth: 10, multiPv: 3 });
		expect(lines[0].pv[0]).toBe('a1a8');
		expect(lines[0].mate).toBe(1);
		expect(lines).toHaveLength(3);
	});

	it('wins a hanging queen and ranks candidate moves best first', async () => {
		const lines = await pool.analyse({ fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', depth: 12, multiPv: 4 });
		expect(lines[0].pv[0]).toBe('d1d5');
		expect(lines[0].cp).toBeGreaterThan(300);
		for (let i = 1; i < lines.length; i++) expect(lines[i - 1].cp).toBeGreaterThanOrEqual(lines[i].cp);
		// the best line includes the opponent's best reply
		expect(lines[0].pv.length).toBeGreaterThan(1);
	});

	it('evaluates a restricted root move (the move actually played)', async () => {
		const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
		const [line] = await pool.analyse({ fen, depth: 10, multiPv: 1, searchMoves: ['e1e2'] });
		expect(line.pv[0]).toBe('e1e2');
		// Ke2 lets Black trade queen for rook instead of losing the queen: far worse than Rxd5
		expect(line.cp).toBeLessThan(0);
	});

	it('serves repeated positions from the cache', async () => {
		const request = { fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', depth: 8, multiPv: 2 };
		const first = await pool.analyse(request);
		const hits = pool.stats.cacheHits;
		const second = await pool.analyse(request);
		expect(pool.stats.cacheHits).toBe(hits + 1);
		expect(second).toEqual(first);
	});

	it('gives identical results for identical searches (fresh hash per search)', async () => {
		const fresh = new EnginePool(engine!, 1, { threads: 1, hash: 16 });
		const fen = 'r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 10';
		const a = await fresh.analyse({ fen, depth: 12, multiPv: 3 });
		await fresh.analyse({ fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', depth: 12, multiPv: 1 });
		const b = await fresh.analyse({ fen, depth: 12, multiPv: 3 });
		fresh.close();
		expect(b).toEqual(a);
	});
});
