#!/usr/bin/env node
/**
 * Lichess archive → curated training games in src/data/game.
 *
 *   npm run games:import            add a batch of up to 1000 new games
 *   npm run games:clear             remove the 1000 oldest games
 *   npm run games:wipe              remove all games
 *   npm run games:refresh           rebuild src/data/game/app from games.json
 *   npm run games:lookahead         build the Look Ahead trees into src/data/game/app/lookahead.json
 *   npm run games:enrich            add the practice fields (threats, opening mistakes, sacrifices…) to games.json
 *
 * See tools/chess-import/README.md.
 */
import path from 'node:path';
import { parseArgs, usage } from './args.ts';
import { defaultConfig } from './config.ts';
import { ENRICH_DEPTH } from './analysis/enrich.ts';
import { clearOldest, refreshApp, wipe } from './dataset.ts';
import { enrichDataset } from './enrich.ts';
import { buildLookAhead, LOOK_AHEAD_SEARCH_DEPTH } from './lookahead.ts';
import { rootDir } from './paths.ts';
import { run } from './pipeline.ts';

try {
	const { command, overrides, count, help } = parseArgs(process.argv.slice(2));
	const config = { ...defaultConfig(), ...overrides };
	const rel = path.relative(rootDir, config.output);
	if (help) {
		console.log(usage());
	} else if (command === 'clear') {
		const { removed, left } = await clearOldest(count, config);
		console.log(`Removed the ${removed} oldest games; ${rel} now holds ${left}.`);
	} else if (command === 'refresh') {
		const count = await refreshApp(config);
		console.log(`Rebuilt the app's copy of ${count} games in ${path.relative(rootDir, config.appDir)}.`);
	} else if (command === 'lookahead') {
		const { added, total, tried } = await buildLookAhead(config, overrides.depth ?? LOOK_AHEAD_SEARCH_DEPTH);
		console.log(`Tried ${tried} positions, added ${added} trees; lookahead.json now holds ${total}.`);
	} else if (command === 'enrich') {
		const { enriched, total } = await enrichDataset(config, overrides.depth ?? ENRICH_DEPTH);
		console.log(`Enriched ${enriched} games; ${total} of the games in ${rel} carry the practice fields.`);
	} else if (command === 'wipe') {
		const removed = await wipe(config);
		console.log(`Removed all ${removed} games from ${rel}. Imported games still won't be imported again.`);
	} else {
		process.exitCode = await run(overrides);
	}
} catch (error) {
	console.error(`\n${(error as Error).message}`);
	process.exitCode = 1;
}
