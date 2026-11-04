import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { PAWNS } from '../progress/progress.const';
import { Award, ProgressService } from '../progress/progress.service';

/** Still the old key, so stats saved before the rename carry over. */
const STORAGE_KEY = 'wawchess_quiz';
/** Puzzles kept in the "recent" strip and history. */
const RECENT = 30;
/** Search windows around the rating, widened until a fresh puzzle is found. */
const WINDOWS = [100, 200, 400, 800];

export interface PracticeResult {
	id: string;
	solved: boolean;
}

export interface PracticeStats {
	played: number;
	solved: number;
	streak: number;
	bestStreak: number;
	/** Ids of every rated puzzle, so none comes back. */
	seen: string[];
	recent: PracticeResult[];
}

const EMPTY: PracticeStats = {
	played: 0,
	solved: 0,
	streak: 0,
	bestStreak: 0,
	seen: [],
	recent: [],
};

/**
 * Puzzle practice history (Mate in 1, Mate in 3, Tactics), kept in the browser like the daily results. The rating and pawns are the
 * player's progress, shared with every other puzzle (see ProgressService).
 */
@Service()
export class PracticeService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly _progress = inject(ProgressService);
	readonly stats = signal<PracticeStats>(this._load());

	/** A fresh puzzle near the player's rating, widening the window when none is left. */
	pick<T extends { id: string; rating: number }>(puzzles: T[], excludeId?: string): T | null {
		const { rating } = this._progress.progress();
		const seen = new Set(this.stats().seen);
		const fresh = (puzzle: T) => !seen.has(puzzle.id) && !this._progress.has(puzzle.id);
		let pool = puzzles.filter((puzzle) => fresh(puzzle) && puzzle.id !== excludeId);
		// every puzzle played: start over rather than stop
		if (!pool.length) pool = puzzles.filter((puzzle) => puzzle.id !== excludeId);
		for (const window of WINDOWS) {
			const near = pool.filter((puzzle) => Math.abs(puzzle.rating - rating) <= window);
			if (near.length) return near[Math.floor(Math.random() * near.length)];
		}
		return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
	}

	/** Records a first attempt; returns what it earned, null when the puzzle earned before. */
	record(puzzle: { id: string; rating: number }, solved: boolean): Award | null {
		const award = this._progress.complete({
			key: puzzle.id,
			rated: { rating: puzzle.rating, score: solved ? 1 : 0 },
			pawns: solved ? PAWNS.puzzleSolved : PAWNS.puzzle,
		});
		const stats = this.stats();
		const streak = solved ? stats.streak + 1 : 0;
		this._save({
			played: stats.played + 1,
			solved: stats.solved + (solved ? 1 : 0),
			streak,
			bestStreak: Math.max(stats.bestStreak, streak),
			seen: [...stats.seen.filter((id) => id !== puzzle.id), puzzle.id],
			recent: [...stats.recent, { id: puzzle.id, solved }].slice(-RECENT),
		});
		return award;
	}

	private _save(stats: PracticeStats) {
		this.stats.set(stats);
		if (!this._isBrowser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
		} catch {
			/* storage unavailable */
		}
	}

	private _load(): PracticeStats {
		if (!this._isBrowser) return { ...EMPTY };
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<PracticeStats>) } : { ...EMPTY };
		} catch {
			return { ...EMPTY };
		}
	}
}
