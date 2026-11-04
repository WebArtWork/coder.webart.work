import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config.ts';
import { inconsistency, replay } from '../src/chess/replay.ts';
import { rejectHeaders, speedOf } from '../src/pgn/filter.ts';
import { parseGame, parseMovetext } from '../src/pgn/parse.ts';
import { OPERA_GAME, OPERA_HEADERS } from './helpers.ts';

describe('PGN parsing', () => {
	it('reads moves, Lichess evals and the result, ignoring clocks, NAGs and variations', () => {
		const movetext =
			'1. e4 { [%eval 0.18] [%clk 0:10:00] } 1... e5?! { [%eval 0.25] } 2. Nf3 $1 (2. f4 exf4) 2... Nc6 { [%eval #-3] } 1-0';
		const parsed = parseMovetext(movetext);
		expect(parsed.san).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
		expect(parsed.evals).toEqual([18, 25, null, -9997]);
		expect(parsed.result).toBe('1-0');
	});

	it('reports no evals for games without analysis', () => {
		expect(parseMovetext('1. d4 d5 2. c4 1/2-1/2').evals).toBeNull();
	});

	it('splits headers from movetext', () => {
		const game = parseGame('[Event "Rated Rapid game"]\n[White "a \\"b\\""]\n\n1. e4 e5 0-1\n');
		expect(game.headers['White']).toBe('a "b"');
		expect(game.san).toEqual(['e4', 'e5']);
	});
});

describe('game validity', () => {
	const config = defaultConfig();

	it('classifies Lichess speeds from the time control', () => {
		expect(speedOf('60+0')).toBe('bullet');
		expect(speedOf('180+2')).toBe('blitz');
		expect(speedOf('600+0')).toBe('rapid');
		expect(speedOf('900+10')).toBe('rapid');
		expect(speedOf('1800+0')).toBe('classical');
		expect(speedOf('-')).toBe('correspondence');
	});

	it('accepts a standard rated rapid/classical game in the rating range', () => {
		expect(rejectHeaders(OPERA_HEADERS, config)).toBeNull();
	});

	it.each([
		['speed', { TimeControl: '180+0' }],
		['variant', { Variant: 'Chess960' }],
		['setup', { FEN: '8/8/8/8/8/8/8/8 w - - 0 1' }],
		['termination', { Termination: 'Time forfeit' }],
		['rating', { WhiteElo: '900' }],
		['rating', { WhiteElo: '2300', BlackElo: '1700' }],
		['bot', { BlackTitle: 'BOT' }],
		['result', { Result: '*' }],
	])('rejects on %s', (reason, change) => {
		expect(rejectHeaders({ ...OPERA_HEADERS, ...change }, config)).toBe(reason);
	});

	it('replays legal games with material and phase per ply', () => {
		const game = replay(OPERA_GAME);
		expect(game.plies).toHaveLength(OPERA_GAME.length);
		expect(game.checkmate).toBe(true);
		expect(game.plies[0].uci).toBe('e2e4');
		expect(game.plies[22].uci).toBe('e1c1'); // O-O-O
		expect(inconsistency(game, '1-0')).toBeNull();
	});

	it('rejects illegal moves and results that contradict the board', () => {
		expect(() => replay(['e4', 'e5', 'Ke3'])).toThrow(/illegal/);
		expect(inconsistency(replay(OPERA_GAME), '0-1')).toMatch(/checkmate/);
	});
});
