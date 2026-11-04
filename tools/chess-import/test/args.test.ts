import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.ts';
import { defaultConfig } from '../src/config.ts';
import { refreshApp, saveDataset } from '../src/dataset.ts';

describe('command line', () => {
	it('keeps an empty path empty, so the app copy can be skipped', () => {
		expect(parseArgs(['--app-dir=']).overrides.appDir).toBe('');
		expect(parseArgs(['--app-dir', '']).overrides.appDir).toBe('');
		expect(path.isAbsolute(parseArgs(['--app-dir', 'somewhere']).overrides.appDir as string)).toBe(true);
	});

	it('writes no app copy when none is wanted', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'chess-import-'));
		try {
			const output = path.join(dir, 'games.json');
			await saveDataset([], { output, appDir: '' });
			expect(JSON.parse(await readFile(output, 'utf8'))).toEqual([]);
			expect(await refreshApp({ output, appDir: '' })).toBe(0);
			expect(existsSync(path.join(dir, 'catalog.json'))).toBe(false);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('asks for what a batch can deliver', () => {
		const { difficultyMix, maxExport, maxScan } = defaultConfig();
		expect(Object.values(difficultyMix).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
		expect(maxExport).toBe(1000);
		// about 8% of archive games pass the filters, and the quick pool is six times the export target
		expect(maxScan * 0.08).toBeGreaterThanOrEqual(maxExport * 4);
	});
});
