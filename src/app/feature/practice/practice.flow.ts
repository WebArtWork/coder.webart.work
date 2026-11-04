import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PAWNS } from '../progress/progress.const';
import { Award, ProgressService } from '../progress/progress.service';
import { PracticeKind } from './practice.interface';
import { ReviewService } from './review.service';

/** Search windows around the rating, widened until a fresh item is found. */
const WINDOWS = [100, 200, 400, 800];
/** Results of this visit kept for the strip at the top. */
const STRIP = 12;

export interface PracticeOutcome {
	solved: boolean;
	/** What the first attempt earned; null for a retry or an item played before. */
	award: Award | null;
	retry: boolean;
}

/**
 * One practice page's items and turns: picks a fresh item near the player's rating (or the one in
 * `?id=`), rates the first attempt, sends misses to the review queue, and in review mode (`?review=1`)
 * moves on through the queue instead. Create it in a component constructor.
 */
export class PracticeFlow<T extends { id: string; rating: number }> {
	private readonly _progress = inject(ProgressService);
	private readonly _review = inject(ReviewService);
	private readonly _router = inject(Router);
	private readonly _route = inject(ActivatedRoute);

	readonly loading = signal(true);
	readonly failed = signal(false);
	/** The file loaded but holds no items, or none match the filter. */
	readonly empty = signal(false);
	readonly item = signal<T | null>(null);
	readonly outcome = signal<PracticeOutcome | null>(null);
	readonly retrying = signal(false);
	/** Solved or missed, this visit, newest last. */
	readonly strip = signal<boolean[]>([]);
	/** Playing the review queue: Next goes to the next item due. */
	readonly reviewing = signal(false);

	private _items: T[] = [];
	private readonly _seen = new Set<string>();

	constructor(
		readonly kind: PracticeKind,
		private readonly _load: () => Promise<T[] | null>,
		/** Narrows the pool, e.g. to one endgame type. */
		private readonly _filter: () => (item: T) => boolean = () => () => true,
	) {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
		void this.start();
		// a review moving on to another item of this practice stays on this page
		this._route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
			this.reviewing.set(params.get('review') === '1');
			const id = params.get('id');
			const found = id && id !== this.item()?.id ? this._items.find((item) => item.id === id) : null;
			if (found) this._present(found);
		});
	}

	async start() {
		this.loading.set(true);
		const items = await this._load();
		this.loading.set(false);
		this.failed.set(!items);
		if (!items) return;
		this._items = items;
		const id = this._route.snapshot.queryParamMap.get('id');
		const shared = items.find((item) => item.id === id);
		if (shared) this._present(shared);
		else this.next();
	}

	/** The next item: the next one due when reviewing, otherwise a fresh one near your rating. */
	next() {
		if (this.reviewing()) {
			const entry = this._review.next(this.item() ? { kind: this.kind, id: this.item()!.id } : undefined);
			if (!entry) {
				void this._router.navigate(['/practice/review']);
				return;
			}
			const { path, query } = this._review.link(entry);
			void this._router.navigate([path], { queryParams: query });
			return;
		}
		const picked = this._pick();
		this.empty.set(!picked);
		if (picked) this._present(picked);
	}

	retry() {
		const item = this.item();
		if (!item) return;
		this.retrying.set(true);
		this.outcome.set(null);
		// a fresh object, so views keyed on the item start over
		this.item.set({ ...item });
	}

	/** Records the attempt once: rated and rewarded the first time, onto the review queue when missed. */
	finish(solved: boolean, score = solved ? 1 : 0) {
		const item = this.item();
		if (!item || this.outcome()) return;
		if (this.retrying()) {
			this.outcome.set({ solved, award: null, retry: true });
			return;
		}
		const award = this._progress.complete({
			key: this.key(item),
			rated: { rating: item.rating, score },
			pawns: solved ? PAWNS.puzzleSolved : PAWNS.puzzle,
		});
		this._review.record(this.kind, item.id, solved);
		this.strip.update((list) => [...list, solved].slice(-STRIP));
		this.outcome.set({ solved, award, retry: false });
	}

	/** The progress key: one per practice and item, so the same position can earn in two practices. */
	key(item: T): string {
		return `${this.kind}-${item.id}`;
	}

	private _pick(): T | null {
		const filter = this._filter();
		const current = this.item()?.id;
		const all = this._items.filter(filter);
		const { rating } = this._progress.progress();
		let pool = all.filter((item) => item.id !== current && !this._seen.has(item.id) && !this._progress.has(this.key(item)));
		// everything played: start over rather than stop
		if (!pool.length) pool = all.filter((item) => item.id !== current);
		if (!pool.length) pool = all;
		for (const window of WINDOWS) {
			const near = pool.filter((item) => Math.abs(item.rating - rating) <= window);
			if (near.length) return near[Math.floor(Math.random() * near.length)];
		}
		return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
	}

	private _present(item: T) {
		this.retrying.set(false);
		this.outcome.set(null);
		this.empty.set(false);
		this._seen.add(item.id);
		this.item.set(item);
		void this._router.navigate([], { queryParams: { id: item.id }, queryParamsHandling: 'merge', replaceUrl: true });
	}
}
