import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import type { GameRecord } from './record.ts';

/**
 * Writes games.json (one game per line) to a temporary file next to it, then renames it into
 * place, so an interrupted run never leaves a partial file. `games` may be lazy.
 */
export async function writeGamesJson(games: Iterable<GameRecord>, output: string): Promise<number> {
	await mkdir(path.dirname(output), { recursive: true });
	const temporary = `${output}.tmp-${process.pid}`;
	const stream = createWriteStream(temporary);
	const write = async (text: string) => {
		if (!stream.write(text)) await once(stream, 'drain');
	};
	let count = 0;
	try {
		await write('[\n');
		for (const game of games) await write((count++ ? ',\n' : '') + JSON.stringify(game));
		await write('\n]\n');
		stream.end();
		await once(stream, 'finish');
		await rename(temporary, output);
	} catch (error) {
		stream.destroy();
		await rm(temporary, { force: true });
		throw error;
	}
	return count;
}
