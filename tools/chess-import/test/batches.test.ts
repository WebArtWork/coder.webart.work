import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Config } from '../src/config.ts';
import { clearOldest, loadHistory, nextArchive, readDataset, refreshApp, wipe } from '../src/dataset.ts';
import { findArchives } from '../src/paths.ts';
import type { GameRecord } from '../src/output/record.ts';
import { validateDataset } from '../src/output/schema.ts';
import type { Catalog } from '../src/output/app.ts';
import { run } from '../src/pipeline.ts';
import { engineOrNull, fixturePgn, tempDir } from './helpers.ts';

const engine = engineOrNull();
const { dir, cleanup } = tempDir();
afterAll(cleanup);

/** Batches of 30 archive games each over the 60-game fixture. */
const config: Partial<Config> = {
	input: fixturePgn,
	workDir: path.join(dir, 'work'),
	output: path.join(dir, 'out', 'games.json'),
	history: path.join(dir, 'history.json'),
	engine: engine ?? '',
	maxScan: 30,
	maxExport: 2,
	quickPool: 6,
	deepPool: 4,
	quickDepth: 6,
	depth: 8,
	workers: 2,
	hash: 16,
	minPrescore: 0,
	minQuality: 20,
	minUniqueness: 10,
	minPositionQuality: 20,
	appDir: path.join(dir, 'out', 'app'),
};
const files = { output: config.output!, appDir: config.appDir! };
const games = () => JSON.parse(readFileSync(config.output!, 'utf8')) as GameRecord[];
const ids = (list: GameRecord[]) => list.map((game) => game.id);

describe.skipIf(!engine)('batches: add, keep, clear, wipe', () => {
	let first: GameRecord[] = [];

	it('the first batch creates games.json', async () => {
		expect(await run(config)).toBe(0);
		first = games();
		expect(first.length).toBeGreaterThan(0);
		expect(first.length).toBeLessThanOrEqual(2);
		expect(validateDataset(first)).toEqual([]);
	});

	it('the next batch appends new games and leaves existing ones untouched', async () => {
		expect(await run(config)).toBe(0);
		const now = games();
		expect(now.slice(0, first.length)).toEqual(first);
		const added = now.slice(first.length);
		expect(added.length).toBeGreaterThan(0);
		expect(ids(added).some((id) => ids(first).includes(id))).toBe(false);
		expect(validateDataset(now)).toEqual([]);
		// it read the next part of the archive, not the same games again
		const history = await loadHistory(config.history!, config.output!);
		expect(history.ids).toEqual(ids(now));
		const progress = history.archives['sample.pgn'];
		expect(progress.gamesRead).toBe(60);
		expect(progress.cursor!.pos).toBeGreaterThan(0);
		expect(progress.finished).toBe(false); // ended exactly on the batch limit, not yet seen the end
	});

	it('games removed by hand never come back', async () => {
		const now = games();
		const removed = now[0].id;
		writeFileSync(config.output!, JSON.stringify(now.slice(1)));
		// another archive file (here a copy holding the same games) has its own position, from the start
		const again = path.join(dir, 'again.pgn');
		copyFileSync(fixturePgn, again);
		expect(await run({ ...config, input: again, maxScan: 1000, maxExport: 50 })).toBe(0);
		expect(ids(games())).not.toContain(removed);
		expect(new Set(ids(games())).size).toBe(games().length);
		const history = await loadHistory(config.history!, config.output!);
		expect(history.archives['again.pgn']).toMatchObject({ gamesRead: 60, finished: true });
		expect(history.archives['sample.pgn'].gamesRead).toBe(60);
	});

	it("clear removes the oldest games and rebuilds the app's copy", async () => {
		const before = games();
		const { removed, left } = await clearOldest(1, files);
		expect(removed).toBe(1);
		expect(ids(games())).toEqual(ids(before.slice(1)));
		const catalog = JSON.parse(readFileSync(path.join(dir, 'out', 'app', 'catalog.json'), 'utf8')) as Catalog;
		expect(catalog.games).toHaveLength(left);
		expect(existsSync(path.join(dir, 'out', 'app', 'g', `${before[0].id}.json`))).toBe(false);
	});

	it('refresh catches the app up after games.json was edited by hand', async () => {
		const now = games();
		writeFileSync(config.output!, JSON.stringify(now.slice(1)));
		expect(await refreshApp(files)).toBe(now.length - 1);
		const catalog = JSON.parse(readFileSync(path.join(dir, 'out', 'app', 'catalog.json'), 'utf8')) as Catalog;
		expect(catalog.games.map((game) => game.id)).toEqual(ids(now.slice(1)));
	});

	it('wipe removes every game', async () => {
		await wipe(files);
		expect(games()).toEqual([]);
		expect(await readDataset(config.output!)).toEqual([]);
	});

	it('refuses to append to a games.json in another format', async () => {
		writeFileSync(config.output!, JSON.stringify([{ id: 'x', moves: 'e4 e5', positions: null }]));
		await expect(run(config)).rejects.toThrow(/another format/);
		await wipe(files);
	});
});

describe('several archives', () => {
	it('continues in the first archive not fully read, oldest month first', () => {
		const files = ['/a/lichess_db_standard_rated_2026-09.pgn.zst', '/a/lichess_db_standard_rated_2026-10.pgn.zst'];
		const progress = (finished: boolean) => ({ cursor: null, gamesRead: 1, finished, updatedAt: '' });
		expect(nextArchive({ archives: {}, ids: [] }, files)).toBe(files[0]);
		expect(nextArchive({ archives: { 'lichess_db_standard_rated_2026-09.pgn.zst': progress(false) }, ids: [] }, files)).toBe(files[0]);
		expect(nextArchive({ archives: { 'lichess_db_standard_rated_2026-09.pgn.zst': progress(true) }, ids: [] }, files)).toBe(files[1]);
		const allDone = { 'lichess_db_standard_rated_2026-09.pgn.zst': progress(true), 'lichess_db_standard_rated_2026-10.pgn.zst': progress(true) };
		expect(nextArchive({ archives: allDone, ids: [] }, files)).toBeNull();
	});

	it('finds the archive next to the project', () => {
		expect(findArchives().map((file) => path.basename(file))).toContain('lichess_db_standard_rated_2026-09.pgn.zst');
	});
});
