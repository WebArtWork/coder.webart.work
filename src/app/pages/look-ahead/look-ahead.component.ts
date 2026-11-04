import { isPlatformBrowser } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, PLATFORM_ID, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BoardComponent, BoardMove } from '../../components/board/board.component';
import { LEVEL_LABELS } from '../../feature/game/game.const';
import { LookAheadItem } from '../../feature/game/game.interface';
import { GameService } from '../../feature/game/game.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { LookAheadPath, LookAheadSession } from '../../feature/lookahead/look-ahead.session';
import { PAWNS } from '../../feature/progress/progress.const';
import { ReviewService } from '../../feature/practice/review.service';
import { Award, ProgressService } from '../../feature/progress/progress.service';

/** A line of the tree as shown in the list. */
interface PathRow {
	path: LookAheadPath;
	text: string;
	found: boolean;
}

/**
 * Look Ahead: a position with a few good lines, three of your moves deep. Play a line, the
 * opponent answers with the best reply; after a full line or a wrong move the board goes back
 * to the start. Find every line, or show the ones left.
 */
@Component({
	imports: [BoardComponent, RouterLink, TPipe],
	templateUrl: './look-ahead.component.html',
})
export class LookAheadComponent {
	private readonly _games = inject(GameService);
	private readonly _router = inject(Router);
	private readonly _progress = inject(ProgressService);
	private readonly _i18n = inject(I18nService);
	private readonly _review = inject(ReviewService);

	protected readonly loading = signal(true);
	protected readonly failed = signal(false);
	/** The file loaded but holds no positions yet. */
	protected readonly empty = signal(false);
	protected readonly session = signal<LookAheadSession | null>(null);
	/** What the finished position earned. */
	protected readonly award = signal<Award | null>(null);

	protected readonly side = computed(() => (this.session()?.item.side === 'black' ? 'Black to move' : 'White to move'));
	protected readonly total = computed(() => this.session()?.paths.length ?? 0);
	protected readonly foundCount = computed(() => this.session()?.found().size ?? 0);
	protected readonly details = computed(() => {
		const item = this.session()?.item;
		if (!item) return '';
		const rating = this._i18n.t('Rating {rating}', { rating: item.rating });
		return `${rating} · ${this._i18n.t(LEVEL_LABELS[item.level])} · ${item.opening}`;
	});
	/** What is going on right now, under the heading. */
	protected readonly status = computed(() => {
		const session = this.session();
		if (!session) return '';
		const verdict = session.verdict();
		if (session.status() === 'checked' && verdict) {
			switch (verdict.kind) {
				case 'found':
					return this._i18n.t('Found a line: {line}', { line: formatLine(session.item.fen, verdict.path.san) });
				case 'again':
					return this._i18n.t('You found this line already. Try another one.');
				case 'miss':
					return this._i18n.t('{move} is not one of the good moves here. Back to the start.', { move: verdict.san.at(-1) });
				default:
					verdict satisfies never;
					return '';
			}
		}
		if (session.status() === 'replying') return this._i18n.t('Your opponent is replying…');
		const step = session.step();
		if (step === 1) return this._i18n.t('Play up to 3 moves. Your opponent answers each one with the best reply.');
		return this._i18n.t('Good. Move {step} of 3.', { step });
	});
	protected readonly rows = computed<PathRow[]>(() => {
		const session = this.session();
		if (!session) return [];
		const found = session.found();
		const rows = session.paths.map((path) => ({
			path,
			text: formatLine(session.item.fen, path.san),
			found: found.has(path.key),
		}));
		// while playing, only the lines found so far are listed
		return session.done() ? rows : rows.filter((row) => row.found);
	});

	private _items: LookAheadItem[] = [];
	private readonly _seen = new Set<string>();

	constructor() {
		const destroyRef = inject(DestroyRef);
		destroyRef.onDestroy(() => this.session()?.dispose());
		// a position earns once, when every line is found or the rest are shown
		effect(() => {
			const session = this.session();
			if (!session?.done()) return;
			untracked(() => {
				const found = session.found().size;
				this._review.record('lookAhead', session.item.id, found === session.paths.length);
				this.award.set(
					this._progress.complete({
						key: `la-${session.item.id}`,
						rated: { rating: session.item.rating, score: session.paths.length ? found / session.paths.length : 0 },
						pawns: Math.min(PAWNS.lookAheadMax, found * PAWNS.lookAheadPath),
					}),
				);
			});
		});
		const id = inject(ActivatedRoute).snapshot.queryParamMap.get('id');
		if (isPlatformBrowser(inject(PLATFORM_ID))) void this._start(id);
	}

	protected onMove({ from, to, promotion }: BoardMove) {
		this.session()?.submitMove(from, to, promotion);
	}

	protected next() {
		const pool = this._items.filter((item) => !this._seen.has(item.id));
		// every position seen: start over rather than stop
		const from = pool.length ? pool : this._items.filter((item) => item.id !== this.session()?.item.id);
		const item = from[Math.floor(Math.random() * from.length)];
		if (item) this._present(item);
	}

	private async _start(id: string | null) {
		const items = await this._games.lookAhead();
		this.loading.set(false);
		if (!items) {
			this.failed.set(true);
			return;
		}
		this.failed.set(false);
		this._items = items;
		if (!items.length) {
			this.empty.set(true);
			return;
		}
		const shared = items.find((item) => item.id === id);
		if (shared) this._present(shared);
		else this.next();
	}

	protected retry() {
		this.loading.set(true);
		void this._start(null);
	}

	private _present(item: LookAheadItem) {
		this.session()?.dispose();
		this.award.set(null);
		this._seen.add(item.id);
		this.session.set(new LookAheadSession(item));
		void this._router.navigate([], { queryParams: { id: item.id }, replaceUrl: true });
	}
}

/** SAN plies with move numbers, e.g. "17. Nf3 Nc6 18. Bb5" or "17... Nf6 18. e5". */
function formatLine(fen: string, sans: string[]): string {
	const [, turn, , , , fullmove] = fen.split(' ');
	let number = Number(fullmove) || 1;
	let white = turn === 'w';
	const parts: string[] = [];
	sans.forEach((san, i) => {
		if (white) parts.push(`${number}. ${san}`);
		else parts.push(i === 0 ? `${number}... ${san}` : san);
		if (!white) number++;
		white = !white;
	});
	return parts.join(' ');
}
