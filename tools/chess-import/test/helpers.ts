import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { findEngine } from '../src/paths.ts';

export const fixturePgn = path.join(import.meta.dirname, 'fixtures', 'sample.pgn');

export function tempDir(): { dir: string; cleanup: () => void } {
	const dir = mkdtempSync(path.join(tmpdir(), 'chess-import-'));
	return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** pzstd layout as Lichess ships it: [skippable frame with compressed size][zstd frame] per chunk. */
export function pzstd(text: Buffer, frameSize: number): Buffer {
	const parts: Buffer[] = [];
	for (let i = 0; i < text.length; i += frameSize) {
		const frame = zstdCompressSync(text.subarray(i, i + frameSize));
		const head = Buffer.alloc(12);
		head.writeUInt32LE(0x184d2a50, 0);
		head.writeUInt32LE(4, 4);
		head.writeUInt32LE(frame.length, 8);
		parts.push(head, frame);
	}
	return Buffer.concat(parts);
}

export function engineOrNull(): string | null {
	try {
		return findEngine('');
	} catch {
		return null;
	}
}

/** Opera Game, Morphy 1858: sacrifices and a mating finish. */
export const OPERA_GAME =
	'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(
		' ',
	);

export const OPERA_HEADERS: Record<string, string> = {
	Event: 'Rated Classical game',
	Site: 'https://lichess.org/opera123',
	Date: '1858.11.02',
	Round: '-',
	White: 'Morphy',
	Black: 'Duke Karl',
	Result: '1-0',
	UTCDate: '1858.11.02',
	UTCTime: '20:00:00',
	WhiteElo: '1800',
	BlackElo: '1700',
	ECO: 'C41',
	Opening: 'Philidor Defense',
	TimeControl: '1800+0',
	Termination: 'Normal',
};
