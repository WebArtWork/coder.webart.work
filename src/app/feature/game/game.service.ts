import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { CatalogGame, CatalogPuzzle, Catalog, GameData, LookAheadItem, Puzzle, PuzzleFilters, PracticeSets } from './game.interface';
import { parsePuzzleId } from './game.const';
import { FileKind, PRACTICE_FILES, PracticeItems } from '../practice/practice.interface';

const BASE = '/game';

/**
 * The games dataset: a catalog for lists, filters and random picks, a daily schedule, and one
 * small file per game fetched when it is opened. Browser only; on the server every read is empty.
 */
@Service()
export class GameService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private _catalog?: Promise<Catalog | null>;
	private _daily?: Promise<Record<string, string>>;
	private _practiceSets?: Promise<PracticeSets | null>;
	private _lookAhead?: Promise<LookAheadItem[] | null>;
	private readonly _games = new Map<string, Promise<GameData | null>>();
	private readonly _practice = new Map<FileKind, Promise<unknown[] | null>>();

	catalog(): Promise<Catalog | null> {
		if (!this._isBrowser) return Promise.resolve(null);
		// a failed load is not cached, so the next call tries again
		this._catalog ??= this._json<Catalog>(`${BASE}/catalog.json`).then((catalog) => {
			if (!catalog) this._catalog = undefined;
			return catalog;
		});
		return this._catalog;
	}

	/** Self-contained mate sets (mate in 1, mate in 3). */
	practiceSets(): Promise<PracticeSets | null> {
		if (!this._isBrowser) return Promise.resolve(null);
		this._practiceSets ??= this._json<PracticeSets>(`${BASE}/practice.json`).then((sets) => {
			if (!sets) this._practiceSets = undefined;
			return sets;
		});
		return this._practiceSets;
	}

	/** Look Ahead positions with their trees. */
	lookAhead(): Promise<LookAheadItem[] | null> {
		if (!this._isBrowser) return Promise.resolve(null);
		this._lookAhead ??= this._json<LookAheadItem[]>(`${BASE}/lookahead.json`).then((items) => {
			if (!items) this._lookAhead = undefined;
			return items;
		});
		return this._lookAhead;
	}

	/** A practice's items (threats.json, eval.json, …), loaded once. */
	practiceItems<K extends FileKind>(kind: K): Promise<PracticeItems[K][] | null> {
		if (!this._isBrowser) return Promise.resolve(null);
		let items = this._practice.get(kind);
		if (!items) {
			items = this._json<unknown[]>(`${BASE}/${PRACTICE_FILES[kind]}`).then((list) => {
				if (!list) this._practice.delete(kind);
				return list;
			});
			this._practice.set(kind, items);
		}
		return items as Promise<PracticeItems[K][] | null>;
	}

	game(id: string): Promise<GameData | null> {
		if (!this._isBrowser || !/^[A-Za-z0-9]+$/.test(id)) return Promise.resolve(null);
		let game = this._games.get(id);
		if (!game) {
			game = this._json<GameData>(`${BASE}/g/${id}.json`);
			this._games.set(id, game);
		}
		return game;
	}

	async puzzle(id: string): Promise<Puzzle | null> {
		const parsed = parsePuzzleId(id);
		if (!parsed) return null;
		const game = await this.game(parsed.game);
		const puzzle = game?.puzzles.find((item) => item.ply === parsed.ply);
		return game && puzzle ? { id, game, puzzle } : null;
	}

	/** The puzzle of the day; days missing from the schedule get a deterministic pick. */
	async daily(date: string): Promise<Puzzle | null> {
		if (!this._isBrowser) return null;
		this._daily ??= this._json<Record<string, string>>(`${BASE}/daily.json`).then((schedule) => schedule ?? {});
		const scheduled = (await this._daily)[date];
		if (scheduled) {
			const puzzle = await this.puzzle(scheduled);
			if (puzzle) return puzzle;
		}
		const puzzles = ((await this.catalog())?.puzzles ?? []).filter((puzzle) => puzzle.mode === 'candidates');
		if (!puzzles.length) return null;
		const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
		return this.puzzle(puzzles[day % puzzles.length].id);
	}

	/** A random puzzle matching the filters, other than `excludeId` when possible. */
	async random(filters: PuzzleFilters, excludeId?: string | null): Promise<Puzzle | null> {
		const matches = this.filterPuzzles((await this.catalog())?.puzzles ?? [], filters);
		const pool = matches.length > 1 ? matches.filter((puzzle) => puzzle.id !== excludeId) : matches;
		if (!pool.length) return null;
		return this.puzzle(pool[Math.floor(Math.random() * pool.length)].id);
	}

	filterPuzzles(puzzles: CatalogPuzzle[], filters: PuzzleFilters): CatalogPuzzle[] {
		const search = filters.search.trim().toLowerCase();
		const any = (selected: string[], values: string[]) => !selected.length || values.some((value) => selected.includes(value));
		return puzzles.filter(
			(puzzle) =>
				any(filters.category, puzzle.categories) &&
				any(filters.theme, puzzle.themes) &&
				any(filters.level, [puzzle.level]) &&
				any(filters.mode, [puzzle.mode]) &&
				any(filters.side, [puzzle.side]) &&
				any(filters.opening, [puzzle.opening]) &&
				any(filters.structure, puzzle.structure ?? []) &&
				any(filters.endgame, puzzle.endgame ? [puzzle.endgame] : []) &&
				(!search || puzzle.opening.toLowerCase().includes(search)),
		);
	}

	/** Games with at least one puzzle matching the filters (search also looks at player names). */
	filterGames(catalog: Catalog, filters: PuzzleFilters): CatalogGame[] {
		const search = filters.search.trim().toLowerCase();
		const puzzleFilters = { ...filters, search: '' };
		const matching = new Set(this.filterPuzzles(catalog.puzzles, puzzleFilters).map((puzzle) => puzzle.game));
		return catalog.games.filter(
			(game) =>
				matching.has(game.id) &&
				(!filters.sacrifice.length || (game.sacrifices ?? []).some((verdict) => filters.sacrifice.includes(verdict))) &&
				(!search ||
					[game.opening ?? '', game.white, game.black].some((text) => text.toLowerCase().includes(search))),
		);
	}

	private async _json<T>(url: string): Promise<T | null> {
		try {
			const response = await fetch(url);
			return response.ok ? ((await response.json()) as T) : null;
		} catch {
			return null;
		}
	}
}
