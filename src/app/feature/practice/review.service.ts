import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID, Service, signal } from '@angular/core';
import { todayString } from '../chess/daily.service';
import { PRACTICE_PATHS, REVIEW_DAYS } from './practice.const';
import { PracticeKind } from './practice.interface';

const STORAGE_KEY = 'wawchess_review';
/** Entries kept at most; the oldest due go first when it is full. */
const MAX_ENTRIES = 300;

/** A mistake found in one of your saved games: played as a find-the-best-move puzzle. */
export interface OwnMistake {
	fen: string;
	/** Your move, UCI and SAN, and the engine's best move with its line. */
	played: string;
	playedSan: string;
	best: string;
	bestSan: string;
	line: string[];
	/** The best move's evaluation, White's point of view in pawns. */
	eval: number;
	/** Pawns the played move gave up. */
	loss: number;
	/** The saved game's title and the move number, to say where it comes from. */
	title: string;
	moveNumber: number;
}

export interface ReviewEntry {
	kind: PracticeKind;
	/** The item's id in its practice; for your own mistakes `<savedGameId>-<ply>`. */
	id: string;
	/** YYYY-MM-DD (UTC, like the daily puzzle). */
	due: string;
	/** Good answers so far: 0 after a miss, then 1, 2; the third one takes it off the queue. */
	step: number;
	own?: OwnMistake;
}

/**
 * The review queue: what you missed comes back after 1, 3 and 7 days, from every practice. A miss
 * puts it back to the start. Kept in this browser, like the daily results.
 */
@Service()
export class ReviewService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly entries = signal<ReviewEntry[]>(this._load());
	readonly due = computed(() => {
		const today = todayString();
		return this.entries()
			.filter((entry) => entry.due <= today)
			.sort((a, b) => a.due.localeCompare(b.due));
	});

	has(kind: PracticeKind, id: string): boolean {
		return this.entries().some((entry) => entry.kind === kind && entry.id === id);
	}

	/** After an answer: a miss goes on the queue for tomorrow, a good answer on the queue moves it on. */
	record(kind: PracticeKind, id: string, solved: boolean, own?: OwnMistake) {
		const entries = this.entries();
		const existing = entries.find((entry) => entry.kind === kind && entry.id === id);
		if (!existing && solved) return;
		const rest = entries.filter((entry) => entry !== existing);
		const step = solved && existing ? existing.step + 1 : 0;
		if (step >= REVIEW_DAYS.length) {
			this._save(rest);
			return;
		}
		const entry: ReviewEntry = { kind, id, due: addDays(todayString(), REVIEW_DAYS[step]), step };
		const data = own ?? existing?.own;
		if (data) entry.own = data;
		this._save([...rest, entry].slice(-MAX_ENTRIES));
	}

	/** Adds mistakes found in saved games, due today; ones already queued are left alone. */
	addOwn(mistakes: { id: string; mistake: OwnMistake }[]): number {
		const fresh = mistakes.filter(({ id }) => !this.has('own', id));
		const today = todayString();
		this._save(
			[...this.entries(), ...fresh.map(({ id, mistake }) => ({ kind: 'own' as const, id, due: today, step: 0, own: mistake }))].slice(
				-MAX_ENTRIES,
			),
		);
		return fresh.length;
	}

	remove(kind: PracticeKind, id: string) {
		this._save(this.entries().filter((entry) => !(entry.kind === kind && entry.id === id)));
	}

	/** Where to play an entry: its practice with `?id=` and `review=1`. */
	link(entry: ReviewEntry): { path: string; query: Record<string, string> } {
		return { path: PRACTICE_PATHS[entry.kind], query: { id: entry.id, review: '1' } };
	}

	/** The next entry due, other than `current`, or null when the queue is done for today. */
	next(current?: { kind: PracticeKind; id: string }): ReviewEntry | null {
		return this.due().find((entry) => !(current && entry.kind === current.kind && entry.id === current.id)) ?? null;
	}

	private _save(entries: ReviewEntry[]) {
		this.entries.set(entries);
		if (!this._isBrowser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
		} catch {
			/* storage unavailable */
		}
	}

	private _load(): ReviewEntry[] {
		if (!this._isBrowser) return [];
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			const list = raw ? (JSON.parse(raw) as ReviewEntry[]) : [];
			return Array.isArray(list) ? list : [];
		} catch {
			return [];
		}
	}
}

/** `date` (YYYY-MM-DD) plus `days`. */
function addDays(date: string, days: number): string {
	const day = new Date(`${date}T00:00:00Z`);
	day.setUTCDate(day.getUTCDate() + days);
	return day.toISOString().slice(0, 10);
}
