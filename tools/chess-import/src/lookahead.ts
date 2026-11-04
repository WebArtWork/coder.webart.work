import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { countPaths, lookAheadTree } from './analysis/lookahead.ts';
import type { Config } from './config.ts';
import { readDataset } from './dataset.ts';
import { EnginePool } from './engine/pool.ts';
import { GOOD_LOSS, LOOK_AHEAD_FILE, openingFamily, puzzleId, type LookAheadItem } from './output/app.ts';
import { findEngine } from './paths.ts';
import { Store } from './store.ts';

/** Shallower than the import's deep pass: a tree takes up to 13 searches. Root positions hit the cache. */
export const LOOK_AHEAD_SEARCH_DEPTH = 16;
const MULTI_PV = 5;
/** Batches between saves, so a long run can be looked at (and stopped) on the way. */
const SAVE_EVERY = 5;

/**
 * Builds the Look Ahead trees for the training positions in games.json into the app's
 * lookahead.json. Positions that already have a tree are skipped unless `fresh`; the engine
 * cache makes a re-run cheap. Saves along the way; Ctrl+C stops after the positions in progress.
 */
export async function buildLookAhead(config: Config, depth: number): Promise<{ added: number; total: number; tried: number }> {
	if (!config.appDir) throw new Error('No app directory to write lookahead.json into (--app-dir)');
	const file = path.join(config.appDir, LOOK_AHEAD_FILE);
	const games = await readDataset(config.output);
	const items = new Map<string, LookAheadItem>();
	if (existsSync(file) && !config.fresh) {
		for (const item of JSON.parse(await readFile(file, 'utf8')) as LookAheadItem[]) items.set(item.id, item);
	}

	const todo = games.flatMap((game) =>
		game.trainingPositions
			.filter((position) => !items.has(puzzleId(game.id, position.ply)))
			.map((position) => ({ game, position })),
	);

	await mkdir(config.workDir, { recursive: true });
	const store = new Store(path.join(config.workDir, 'import.sqlite'));
	const pool = new EnginePool(findEngine(config.engine), config.workers, { threads: 1, hash: config.hash }, store);
	const analyse = (fen: string) => pool.analyse({ fen, depth, multiPv: MULTI_PV });

	let stop = false;
	const onSigint = () => {
		stop = true;
		process.stdout.write('\nStopping after the positions in progress…\n');
	};
	process.once('SIGINT', onSigint);

	// only positions still in games.json, in a stable order; written atomically
	const ids = new Set(games.map((game) => game.id));
	const kept = () => [...items.values()].filter((item) => ids.has(item.game)).sort((a, b) => a.id.localeCompare(b.id));
	const save = async () => {
		await mkdir(config.appDir, { recursive: true });
		await writeFile(`${file}.tmp`, JSON.stringify(kept()));
		await rename(`${file}.tmp`, file);
	};

	let added = 0;
	let tried = 0;
	const batch = Math.max(1, config.workers * 4);
	try {
		for (let i = 0; i < todo.length && !stop; i += batch) {
			await Promise.all(
				todo.slice(i, i + batch).map(async ({ game, position }) => {
					const tree = await lookAheadTree(position.fen, analyse, GOOD_LOSS).catch(() => null);
					tried++;
					if (!tree) return;
					const id = puzzleId(game.id, position.ply);
					items.set(id, {
						id,
						game: game.id,
						ply: position.ply,
						fen: position.fen,
						side: position.sideToMove,
						rating: position.difficultyRating,
						level: position.difficulty,
						opening: openingFamily(game.opening),
						paths: countPaths(tree),
						tree,
					});
					added++;
				}),
			);
			process.stdout.write(`\rLook Ahead: ${tried}/${todo.length} positions, ${added} trees added`);
			if ((i / batch) % SAVE_EVERY === SAVE_EVERY - 1) await save();
		}
	} finally {
		process.off('SIGINT', onSigint);
		pool.close();
		store.close();
		process.stdout.write('\n');
	}

	await save();
	return { added, total: kept().length, tried };
}
