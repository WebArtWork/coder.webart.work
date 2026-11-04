import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { summarise, type CandidateGame } from '../src/analysis/game.ts';
import { analysePosition } from '../src/analysis/position.ts';
import { replay } from '../src/chess/replay.ts';
import type { EngineLine } from '../src/engine/uci.ts';
import { buildRecord, type GameRecord } from '../src/output/record.ts';
import { validateDataset, validateGame } from '../src/output/schema.ts';
import { OPERA_GAME, OPERA_HEADERS } from './helpers.ts';

/** A complete record for the Opera Game with two engine-style training positions. */
function operaRecord(): GameRecord {
	const plies = replay(OPERA_GAME).plies;
	const game: CandidateGame = {
		id: 'opera123',
		headers: OPERA_HEADERS,
		san: plies.map((ply) => ply.san),
		uci: plies.map((ply) => ply.uci),
		prescore: 80,
		signals: [],
	};
	const at = (ply: number, lines: EngineLine[]) =>
		analysePosition({
			ply,
			fen: plies[ply].fen,
			lines,
			playedLine: null,
			playedUci: plies[ply].uci,
			lastCaptureSquare: null,
			depth: 18,
			pvPlies: 12,
		});
	const quiet = (ply: number) => {
		const move = new Chess(plies[ply].fen).moves({ verbose: true }).find((m) => m.lan !== plies[ply].uci && !m.captured);
		return move!.lan;
	};
	const line = (cp: number, pv: string[], mate: number | null = null): EngineLine => ({ cp, mate, depth: 18, pv });
	const positions = [
		at(18, [line(350, ['c3b5', 'c6b5', 'c4b5']), line(20, [quiet(18)]), line(10, ['a2a3'])]),
		at(30, [line(9998, ['b3b8', 'd7b8', 'd1d8'], 2), line(500, [quiet(30)])]),
	];
	const analysis = summarise(game, positions, { depth: 18, multiPv: 5, pvPlies: 12, positionsPerGame: 5, minPositions: 1, minPositionQuality: 0 });
	return buildRecord(game, analysis, 77, '2026-10-14T10:00:00.000Z');
}

describe('JSON schema validation', () => {
	it('accepts a complete game record', () => {
		const record = operaRecord();
		expect(record.trainingPositions.length).toBeGreaterThan(0);
		expect(validateGame(record)).toEqual([]);
		expect(validateDataset([record])).toEqual([]);
		// round-trips through JSON unchanged
		expect(validateGame(JSON.parse(JSON.stringify(record)))).toEqual([]);
	});

	it('keeps the complete original game for replay', () => {
		const record = operaRecord();
		expect(record.moves).toEqual(OPERA_GAME);
		expect(record.uciMoves[0]).toBe('e2e4');
		expect(record.pgn).toContain('17. Rd8# 1-0');
		const position = record.trainingPositions.at(-1)!;
		expect(position.bestMove).toEqual({ san: 'Qb8+', uci: 'b3b8' });
		expect(position.bestReply).toEqual({ san: 'Nxb8', uci: 'd7b8' });
		expect(position.candidateMoves[0].mate).toBe(2);
	});

	it.each<[string, (record: GameRecord) => void, RegExp]>([
		['a FEN not from the game', (r) => (r.trainingPositions[0].fen = '8/8/8/8/8/8/8/K6k w - - 0 1'), /not the game position/],
		['UCI disagreeing with SAN', (r) => (r.uciMoves[3] = 'a7a6'), /uci/],
		['an illegal candidate', (r) => (r.trainingPositions[0].candidateMoves[1].uci = 'a1h8'), /illegal/],
		['a score out of range', (r) => (r.qualityScore = 140), /qualityScore/],
		['an unknown category', (r) => ((r.categories as string[])[0] = 'luck'), /categories/],
		['a missing best move', (r) => (r.trainingPositions[0].bestMove.uci = 'h2h4'), /bestMove/],
	])('rejects %s', (_, corrupt, message) => {
		const record = operaRecord();
		corrupt(record);
		expect(validateGame(record).join('\n')).toMatch(message);
	});

	it('rejects duplicate ids in the dataset', () => {
		expect(validateDataset([operaRecord(), operaRecord()])).toContain('duplicate id opera123');
		expect(validateDataset({})).toEqual(['dataset is not an array']);
	});
});
