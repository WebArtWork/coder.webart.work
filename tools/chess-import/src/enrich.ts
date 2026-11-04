import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ENRICH_VERSION, enrichGame } from './analysis/enrich.ts';
import type { Config } from './config.ts';
import { readDataset, saveDataset } from './dataset.ts';
import { EnginePool } from './engine/pool.ts';
import { writeGamesJson } from './output/write.ts';
import { validateGame } from './output/schema.ts';
import { findEngine } from './paths.ts';
import { Store } from './store.ts';

/** Batches between saves, so a long run can be stopped and continued. */
const SAVE_EVERY = 5;

/**
 * Adds the practice fields (`enrichGame`) to the games in games.json that do not have them yet, or
 * to every game with `fresh`. Nothing else changes and no game is added or removed. Saves along the
 * way; Ctrl+C stops after the games in progress, and the next run continues. The app's copy is
 * rebuilt at the end.
 */
export async function enrichDataset(config: Config, depth: number): Promise<{ enriched: number; total: number }> {
	const games = await readDataset(config.output);
	const todo = games.flatMap((game, index) => (config.fresh || game.enriched !== ENRICH_VERSION ? [index] : []));

	await mkdir(config.workDir, { recursive: true });
	const store = new Store(path.join(config.workDir, 'import.sqlite'));
	const pool = new EnginePool(findEngine(config.engine), config.workers, { threads: 1, hash: config.hash }, store);

	let stop = false;
	const onSigint = () => {
		stop = true;
		process.stdout.write('\nStopping after the games in progress…\n');
	};
	process.once('SIGINT', onSigint);

	let enriched = 0;
	let failed = 0;
	const batch = Math.max(1, config.workers * 2);
	try {
		for (let i = 0; i < todo.length && !stop; i += batch) {
			await Promise.all(
				todo.slice(i, i + batch).map(async (index) => {
					try {
						const game = await enrichGame(games[index], (request) => pool.analyse(request), depth);
						const errors = validateGame(game);
						if (errors.length) throw new Error(errors.slice(0, 3).join('; '));
						games[index] = game;
						enriched++;
					} catch (error) {
						failed++;
						process.stdout.write(`\n  ${games[index].id}: ${(error as Error).message}\n`);
					}
				}),
			);
			process.stdout.write(`\rEnrich: ${Math.min(i + batch, todo.length)}/${todo.length} games, ${pool.stats.searches} searches${failed ? `, ${failed} failed` : ''}`);
			if ((i / batch) % SAVE_EVERY === SAVE_EVERY - 1) await writeGamesJson(games, config.output);
		}
	} finally {
		process.off('SIGINT', onSigint);
		pool.close();
		store.close();
		process.stdout.write('\n');
	}

	await saveDataset(games, config);
	return { enriched, total: games.filter((game) => game.enriched === ENRICH_VERSION).length };
}
