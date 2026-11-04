import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Config, Stage } from '../src/config.ts';
import { validateDataset } from '../src/output/schema.ts';
import type { AppGame, Catalog } from '../src/output/app.ts';
import type { GameRecord } from '../src/output/record.ts';
import { run } from '../src/pipeline.ts';
import { engineOrNull, fixturePgn, tempDir } from './helpers.ts';

const engine = engineOrNull();
const { dir, cleanup } = tempDir();
afterAll(cleanup);

/** A tiny but complete run over the 60-game fixture. */
function config(name: string): Partial<Config> {
	return {
		input: fixturePgn,
		workDir: path.join(dir, name, 'work'),
		output: path.join(dir, name, 'out', 'games.json'),
		history: path.join(dir, name, 'history.json'),
		engine: engine ?? '',
		maxScan: 1000,
		maxExport: 4,
		quickPool: 10,
		deepPool: 6,
		quickDepth: 6,
		depth: 9,
		workers: 2,
		hash: 16,
		minPrescore: 0,
		minQuality: 20,
		minUniqueness: 10,
		minPositionQuality: 20,
		appDir: path.join(dir, name, 'out', 'app'),
	};
}

/** Stops the run once `stage` has handled `count` games, as Ctrl+C would. */
function stopAt(stage: Stage, count: number) {
	const stop = { requested: false };
	return {
		stop,
		onProgress: (current: Stage, done: number) => {
			if (current === stage && done >= count) stop.requested = true;
		},
	};
}

describe.skipIf(!engine)('checkpoint and resume', () => {
	it('an interrupted batch continued twice writes the same dataset as an uninterrupted one', async () => {
		const straight = config('straight');
		expect(await run(straight)).toBe(0);
		const expected = readFileSync(straight.output!, 'utf8');
		const games = JSON.parse(expected);
		expect(games.length).toBeGreaterThan(0);
		expect(validateDataset(games)).toEqual([]);

		const resumed = config('resumed');
		expect(await run(resumed, stopAt('scan', 25))).toBe(130); // mid-scan
		expect(existsSync(resumed.output!)).toBe(false); // nothing half-written
		expect(await run(resumed, stopAt('quick', 3))).toBe(130); // mid engine pass, continued automatically
		expect(await run(resumed)).toBe(0);
		// identical apart from the batch timestamp
		const withoutTime = (text: string) => text.replace(/"importedAt":"[^"]+"/g, '');
		expect(withoutTime(readFileSync(resumed.output!, 'utf8'))).toBe(withoutTime(expected));
	});

	it("writes the app's copy: a catalog, a daily schedule and one file per game", () => {
		const out = path.dirname(config('straight').output!);
		const games = JSON.parse(readFileSync(path.join(out, 'games.json'), 'utf8')) as GameRecord[];
		const catalog = JSON.parse(readFileSync(path.join(out, 'app', 'catalog.json'), 'utf8')) as Catalog;
		expect(catalog.games.map((game) => game.id)).toEqual(games.map((game) => game.id));
		expect(catalog.puzzles).toHaveLength(games.reduce((sum, game) => sum + game.trainingPositions.length, 0));
		for (const game of games) {
			const file = JSON.parse(readFileSync(path.join(out, 'app', 'g', `${game.id}.json`), 'utf8')) as AppGame;
			expect(file.moves).toBe(game.moves.join(' '));
			expect(file.puzzles.map((puzzle) => puzzle.ply)).toEqual(game.trainingPositions.map((position) => position.ply));
		}
		const daily = JSON.parse(readFileSync(path.join(out, 'app', 'daily.json'), 'utf8')) as Record<string, string>;
		const ids = new Set(catalog.puzzles.map((puzzle) => puzzle.id));
		expect(Object.keys(daily).length).toBeGreaterThan(300);
		expect(Object.values(daily).every((id) => ids.has(id))).toBe(true);
	});
});
