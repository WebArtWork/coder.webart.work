import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { practiceTags, type CandidateGame, type GameAnalysis } from './analysis/game.ts';
import type { EngineCache } from './engine/pool.ts';
import type { EngineLine } from './engine/uci.ts';
import type { Selectable, Selected } from './similarity/select.ts';

/** Pass number: 1 = quick engine pass, 2 = deep engine pass. */
export type Pass = 1 | 2;

/**
 * All intermediate state of a run in one SQLite file: checkpoint, candidates, engine analyses,
 * selection, and an engine cache that survives between runs. Nothing here is held in memory.
 */
export class Store implements EngineCache {
	readonly db: DatabaseSync;
	private readonly _cacheGet: StatementSync;
	private readonly _cachePut: StatementSync;

	constructor(file: string) {
		this.db = new DatabaseSync(file);
		this.db.exec(`
			PRAGMA journal_mode = WAL;
			PRAGMA synchronous = NORMAL;
			CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS candidates (
				id TEXT PRIMARY KEY,
				moves_hash TEXT NOT NULL UNIQUE,
				game TEXT NOT NULL,
				prescore REAL NOT NULL,
				pool INTEGER NOT NULL DEFAULT 0,
				pass INTEGER NOT NULL DEFAULT 0,
				quick TEXT,
				quick_quality REAL,
				deep TEXT,
				deep_quality REAL
			);
			CREATE INDEX IF NOT EXISTS candidates_prescore ON candidates (prescore DESC);
			CREATE INDEX IF NOT EXISTS candidates_pool ON candidates (pool, pass);
			CREATE TABLE IF NOT EXISTS selection (id TEXT PRIMARY KEY, rank INTEGER NOT NULL, uniqueness INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS engine_cache (
				key TEXT NOT NULL,
				multipv INTEGER NOT NULL,
				depth INTEGER NOT NULL,
				lines TEXT NOT NULL,
				PRIMARY KEY (key, multipv, depth)
			);
		`);
		this._cacheGet = this.db.prepare(
			'SELECT lines FROM engine_cache WHERE key = ? AND multipv >= ? AND depth >= ? ORDER BY depth ASC, multipv ASC LIMIT 1',
		);
		this._cachePut = this.db.prepare('INSERT OR REPLACE INTO engine_cache (key, multipv, depth, lines) VALUES (?, ?, ?, ?)');
	}

	close(): void {
		this.db.close();
	}

	transaction<T>(work: () => T): T {
		this.db.exec('BEGIN');
		try {
			const result = work();
			this.db.exec('COMMIT');
			return result;
		} catch (error) {
			this.db.exec('ROLLBACK');
			throw error;
		}
	}

	getMeta<T>(key: string): T | undefined {
		const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
		return row ? (JSON.parse(row.value) as T) : undefined;
	}

	setMeta(key: string, value: unknown): void {
		this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
	}

	/** Forget the previous run; the engine cache is kept. */
	resetRun(): void {
		this.db.exec('DELETE FROM meta; DELETE FROM candidates; DELETE FROM selection;');
	}

	/** False when the game (or one with identical moves) is already stored. */
	insertCandidate(game: CandidateGame, movesHash: string): boolean {
		const result = this.db
			.prepare('INSERT OR IGNORE INTO candidates (id, moves_hash, game, prescore) VALUES (?, ?, ?, ?)')
			.run(game.id, movesHash, JSON.stringify(game), game.prescore);
		return Number(result.changes) > 0;
	}

	countCandidates(): number {
		return (this.db.prepare('SELECT COUNT(*) AS n FROM candidates').get() as { n: number }).n;
	}

	/** Keep only the `keep` best candidates by prescore. */
	pruneCandidates(keep: number): number {
		const excess = this.countCandidates() - keep;
		if (excess <= 0) return 0;
		this.db
			.prepare('DELETE FROM candidates WHERE id IN (SELECT id FROM candidates ORDER BY prescore ASC LIMIT ?)')
			.run(excess);
		return excess;
	}

	/** Marks the `size` best candidates by prescore for the quick pass. */
	markQuickPool(size: number): number {
		this.db.exec('UPDATE candidates SET pool = 0');
		this.db
			.prepare('UPDATE candidates SET pool = 1 WHERE id IN (SELECT id FROM candidates ORDER BY prescore DESC LIMIT ?)')
			.run(size);
		return this.poolSize(1);
	}

	markDeepPool(ids: string[]): void {
		this.transaction(() => {
			const statement = this.db.prepare('UPDATE candidates SET pool = 2 WHERE id = ?');
			for (const id of ids) statement.run(id);
		});
	}

	poolSize(pass: Pass): number {
		return (this.db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE pool >= ?').get(pass) as { n: number }).n;
	}

	/** Pool members still waiting for this pass, best first. */
	pendingIds(pass: Pass): string[] {
		const order = pass === 1 ? 'prescore DESC' : 'quick_quality DESC';
		return (
			this.db.prepare(`SELECT id FROM candidates WHERE pool >= ? AND pass < ? ORDER BY ${order}`).all(pass, pass) as {
				id: string;
			}[]
		).map((row) => row.id);
	}

	getCandidate(id: string): { game: CandidateGame; quick: GameAnalysis | null; deep: GameAnalysis | null } {
		const row = this.db.prepare('SELECT game, quick, deep FROM candidates WHERE id = ?').get(id) as {
			game: string;
			quick: string | null;
			deep: string | null;
		};
		return {
			game: JSON.parse(row.game) as CandidateGame,
			quick: row.quick ? (JSON.parse(row.quick) as GameAnalysis) : null,
			deep: row.deep ? (JSON.parse(row.deep) as GameAnalysis) : null,
		};
	}

	saveAnalysis(id: string, pass: Pass, analysis: GameAnalysis): void {
		const column = pass === 1 ? 'quick' : 'deep';
		this.db
			.prepare(`UPDATE candidates SET ${column} = ?, ${column}_quality = ?, pass = ? WHERE id = ?`)
			.run(JSON.stringify(analysis), analysis.quality, pass, id);
	}

	/** Compact rows for the selection algorithm, read one at a time. */
	selectables(pass: Pass): Selectable[] {
		const column = pass === 1 ? 'quick' : 'deep';
		const rows = this.db
			.prepare(`SELECT id, ${column} AS analysis FROM candidates WHERE pass >= ? AND ${column}_quality > 0`)
			.iterate(pass) as Iterable<{ id: string; analysis: string }>;
		const items: Selectable[] = [];
		for (const row of rows) {
			const analysis = JSON.parse(row.analysis) as GameAnalysis;
			items.push({
				id: row.id,
				quality: analysis.quality,
				difficulty: analysis.difficulty,
				tokens: analysis.tokens,
				fens: analysis.fens,
				tags: practiceTags(analysis.positions),
			});
		}
		return items;
	}

	saveSelection(selected: Selected[]): void {
		this.transaction(() => {
			this.db.exec('DELETE FROM selection');
			const statement = this.db.prepare('INSERT INTO selection (id, rank, uniqueness) VALUES (?, ?, ?)');
			for (const item of selected) statement.run(item.id, item.rank, item.uniqueness);
		});
	}

	selection(): Selected[] {
		return this.db.prepare('SELECT id, rank, uniqueness FROM selection ORDER BY rank').all() as unknown as Selected[];
	}

	get(key: string, multiPv: number, depth: number): EngineLine[] | null {
		const row = this._cacheGet.get(key, multiPv, depth) as { lines: string } | undefined;
		return row ? (JSON.parse(row.lines) as EngineLine[]) : null;
	}

	put(key: string, multiPv: number, depth: number, lines: EngineLine[]): void {
		this._cachePut.run(key, multiPv, depth, JSON.stringify(lines));
	}
}
