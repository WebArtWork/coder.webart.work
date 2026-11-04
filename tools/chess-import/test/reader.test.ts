import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readGames, type RawGame } from '../src/pgn/reader.ts';
import { fixturePgn, pzstd, tempDir } from './helpers.ts';

const { dir, cleanup } = tempDir();
afterAll(cleanup);

const text = readFileSync(fixturePgn);
const expected = text.toString('utf8').split(/\n(?=\[Event )/).filter((game) => game.trim()).length;

async function collect(file: string, from?: RawGame['start']): Promise<RawGame[]> {
	const games: RawGame[] = [];
	for await (const game of readGames(file, from)) games.push(game);
	return games;
}

describe('streaming PGN reader', () => {
	it('reads every game of a plain PGN file', async () => {
		const games = await collect(fixturePgn);
		expect(games).toHaveLength(expected);
		expect(games.every((game) => game.text.startsWith('[Event '))).toBe(true);
		expect(games.map((game) => game.text).join('')).toBe(text.toString('utf8'));
	});

	it('reads a pzstd archive whose frames split games and lines mid-way', async () => {
		const file = path.join(dir, 'sample.pgn.zst');
		writeFileSync(file, pzstd(text, 7_777)); // odd frame size: boundaries land inside headers and moves
		const games = await collect(file);
		expect(games).toHaveLength(expected);
		expect(games.map((game) => game.text).join('')).toBe(text.toString('utf8'));
	});

	it('reads a single-stream zstd file', async () => {
		const file = path.join(dir, 'single.pgn.zst');
		writeFileSync(file, pzstd(text, text.length).subarray(12));
		expect(await collect(file)).toHaveLength(expected);
	});

	it.each([
		['plain', () => fixturePgn],
		[
			'pzstd',
			() => {
				const file = path.join(dir, 'resume.pgn.zst');
				writeFileSync(file, pzstd(text, 5_000));
				return file;
			},
		],
	])('resumes from any game cursor (%s)', async (_, makeFile) => {
		const file = makeFile();
		const all = await collect(file);
		for (const cut of [1, 17, all.length - 1]) {
			const rest = await collect(file, all[cut - 1].end);
			expect(rest.map((game) => game.text)).toEqual(all.slice(cut).map((game) => game.text));
		}
	});

	it('stops cleanly on a truncated archive', async () => {
		const file = path.join(dir, 'truncated.pgn.zst');
		const archive = pzstd(text, 20_000);
		writeFileSync(file, archive.subarray(0, archive.length - 100));
		const games = await collect(file);
		expect(games.length).toBeGreaterThan(0);
		expect(games.length).toBeLessThan(expected);
	});
});
