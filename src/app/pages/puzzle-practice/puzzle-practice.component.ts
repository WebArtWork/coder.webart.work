import { isPlatformBrowser } from '@angular/common';
import {
	afterRenderEffect,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	PLATFORM_ID,
	signal,
	untracked,
	viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BoardComponent, BoardMove } from '../../components/board/board.component';
import { EngineService } from '../../feature/chess/engine.service';
import { PlayModeService } from '../../feature/chess/play-mode.service';
import { CATEGORY_LABELS, levelOf, themeLabel } from '../../feature/game/game.const';
import { MateItem, PuzzleData } from '../../feature/game/game.interface';
import { GameService } from '../../feature/game/game.service';
import { PuzzleRun } from '../../feature/game/puzzle.run';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { ProgressService } from '../../feature/progress/progress.service';
import { PracticeKind } from '../../feature/practice/practice.interface';
import { PracticeService } from '../../feature/practice/practice.service';
import { ReviewService } from '../../feature/practice/review.service';

export type PuzzleType = 'mate1' | 'mate3' | 'mixed' | 'endgame';

const PUZZLE_TITLES: Record<PuzzleType, string> = { mate1: 'Mate in 1', mate3: 'Mate in 3', mixed: 'Tactics', endgame: 'Endgame technique' };
/** Which practice a set is, for the review queue. */
const PUZZLE_KINDS: Record<PuzzleType, PracticeKind> = { mate1: 'mate1', mate3: 'mate3', mixed: 'tactics', endgame: 'endgame' };

/** Endgame technique: all endgames, one family, or the stalemate traps. */
export const ENDGAME_CHOICES = [
	{ value: 'all', label: 'All endgames' },
	{ value: 'pawn', label: 'Pawn' },
	{ value: 'rook', label: 'Rook' },
	{ value: 'minor', label: 'Minor piece' },
	{ value: 'queen', label: 'Queen' },
	{ value: 'mixed', label: 'Mixed' },
	{ value: 'stalemateTrap', label: 'Stalemate traps' },
];

interface PracticePuzzle {
	id: string;
	game: string;
	ply: number;
	puzzle: PuzzleData;
}

interface PuzzleOutcome {
	solved: boolean;
	/** Rating change; null when not rated: a retry, or a puzzle played before. */
	delta: number | null;
	pawns: number;
	retry: boolean;
}

/** A candidate for the next puzzle; `load` fetches what it needs to be played. */
interface PuzzleEntry {
	id: string;
	rating: number;
	/** Endgame technique: the endgame family and whether it hides a stalemate trap. */
	endgame?: string | null;
	stalemateTrap?: boolean;
	load: () => Promise<PracticePuzzle | null>;
}

/** Results of this visit, newest last, for the strip at the top. */
const SESSION_STRIP = 12;

/**
 * Puzzle after puzzle: solve it with one try, see the result and the rating change, move on.
 * Puzzles come from the games collection, near the player's rating.
 */
@Component({
	imports: [BoardComponent, TPipe],
	templateUrl: './puzzle-practice.component.html',
})
export class PuzzlePracticeComponent {
	private readonly _games = inject(GameService);
	private readonly _engine = inject(EngineService);
	private readonly _playMode = inject(PlayModeService);
	private readonly _i18n = inject(I18nService);
	protected readonly practice = inject(PracticeService);
	protected readonly player = inject(ProgressService);
	private readonly _review = inject(ReviewService);
	private readonly _router = inject(Router);
	private readonly _route = inject(ActivatedRoute);
	private readonly _next = viewChild<ElementRef<HTMLElement>>('nextButton');

	/** Which puzzle set this route is, from its `practice` data (/practices/mate-in-one, …). */
	protected readonly type = signal<PuzzleType>(readType(this._route.snapshot.data['practice']));
	protected readonly title = PUZZLE_TITLES[this.type()];
	protected readonly endgameChoices = ENDGAME_CHOICES;
	/** Endgame technique only: the family to train. */
	protected readonly endgame = signal('all');
	/** Playing the review queue (`?review=1`): Next goes to the next item due. */
	protected readonly reviewing = signal(this._route.snapshot.queryParamMap.get('review') === '1');
	protected readonly loading = signal(true);
	protected readonly failed = signal(false);
	protected readonly current = signal<PracticePuzzle | null>(null);
	protected readonly run = signal<PuzzleRun | null>(null);
	protected readonly outcome = signal<PuzzleOutcome | null>(null);
	/** Retries are not rated. */
	protected readonly retrying = signal(false);
	protected readonly session = signal<boolean[]>([]);

	protected readonly stats = this.practice.stats;
	protected readonly strip = computed(() => this.session().slice(-SESSION_STRIP));
	protected readonly side = computed(() => (this.current()?.puzzle.side === 'black' ? 'Black to move' : 'White to move'));
	protected readonly task = computed(() => {
		if (this.type() === 'mate1') return 'Mate in 1. Find the mating move.';
		if (this.type() === 'mate3') return 'Mate in 3. Play the mating line, move by move.';
		return this.current()?.puzzle.mode === 'line' ? 'Play the best line, move by move.' : 'Find the best move.';
	});
	/** The line as played or as it should have been, e.g. "Nxe5 dxe5 Qh5+". */
	protected readonly solution = computed(() => this.run()?.line?.solutionSans.join(' ') ?? '');
	protected readonly progress = computed(() => {
		const line = this.run()?.line;
		if (!line || line.done()) return null;
		if (line.status() === 'checking') return 'Checking your move…';
		return line.found() ? 'Correct. Keep going.' : null;
	});
	protected readonly details = computed(() => {
		const puzzle = this.current()?.puzzle;
		if (!puzzle) return '';
		const themes = puzzle.themes.filter((theme) => !theme.startsWith('mateIn')).map(themeLabel);
		return [CATEGORY_LABELS[puzzle.category], ...themes].map((label) => this._i18n.t(label)).join(' · ');
	});

	private readonly _pools = new Map<PuzzleType, PuzzleEntry[]>();

	constructor() {
		const destroyRef = inject(DestroyRef);
		destroyRef.onDestroy(() => {
			this.run()?.dispose();
			this._playMode.fen.set(null);
		});
		effect(() => this._playMode.fen.set(this.run()?.fen() ?? null));

		// rate the first attempt as soon as it ends
		effect(() => {
			const run = this.run();
			if (!run?.done() || untracked(this.outcome)) return;
			untracked(() => this._finish(run));
		});

		// the Next button takes focus, so Enter moves on
		afterRenderEffect(() => {
			if (this.outcome()) this._next()?.nativeElement.focus({ preventScroll: true });
		});

		if (isPlatformBrowser(inject(PLATFORM_ID))) void this._start(this._route.snapshot.queryParamMap.get('id'));
	}

	protected chooseEndgame(value: string) {
		this.endgame.set(value);
		void this.next();
	}

	/** The puzzle in `?id=` when it is in this set, otherwise a fresh one. */
	private async _start(id: string | null) {
		const entry = id ? (await this._pool(this.type())).find((item) => item.id === id) : null;
		const puzzle = entry ? await entry.load() : null;
		if (puzzle) this._present(puzzle);
		else await this.next();
	}

	protected onMove({ from, to, promotion }: BoardMove) {
		this.run()?.submit(from, to, promotion);
	}

	protected async next() {
		if (this.reviewing()) {
			const current = this.current();
			const entry = this._review.next(current ? { kind: PUZZLE_KINDS[this.type()], id: current.id } : undefined);
			if (!entry) {
				void this._router.navigate(['/practices/review']);
				return;
			}
			const { path, query } = this._review.link(entry);
			// another puzzle of this set stays on this page
			if (path === this._router.url.split('?')[0]) {
				this.retrying.set(false);
				return this._start(entry.id);
			}
			void this._router.navigate([path], { queryParams: query });
			return;
		}
		const type = this.type();
		const all = await this._pool(type);
		const pool = all.filter(this._endgameFilter());
		// a family with no puzzles yet falls back to every endgame
		const picked = this.practice.pick(pool.length ? pool : all, this.current()?.id);
		const puzzle = picked ? await picked.load() : null;
		if (type !== this.type()) return;
		if (!puzzle) {
			this.failed.set(true);
			this.loading.set(false);
			return;
		}
		this.retrying.set(false);
		this._present(puzzle);
	}

	protected retry() {
		const puzzle = this.current();
		if (!puzzle) return;
		this.retrying.set(true);
		this._present(puzzle);
	}

	/** Puzzles of a type, loaded once. */
	private async _pool(type: PuzzleType): Promise<PuzzleEntry[]> {
		const cached = this._pools.get(type);
		if (cached) return cached;
		let pool: PuzzleEntry[] = [];
		if (type === 'mate1' || type === 'mate3') {
			const items = (await this._games.practiceSets())?.[type] ?? [];
			pool = items.map((item) => ({ id: item.id, rating: item.rating, load: async () => fromMateItem(item) }));
		} else {
			const puzzles = (await this._games.catalog())?.puzzles ?? [];
			pool = puzzles
				.filter((puzzle) => (puzzle.mode === 'best' || puzzle.mode === 'line') && (type !== 'endgame' || puzzle.endgame))
				.map((puzzle) => ({
					id: puzzle.id,
					rating: puzzle.rating,
					endgame: puzzle.endgame,
					stalemateTrap: puzzle.themes.includes('stalemateTrap'),
					load: async () => {
						const loaded = await this._games.puzzle(puzzle.id);
						return loaded && { id: loaded.id, game: loaded.game.id, ply: loaded.puzzle.ply, puzzle: loaded.puzzle };
					},
				}));
		}
		if (pool.length) this._pools.set(type, pool);
		return pool;
	}

	/** Endgame technique: keeps the chosen family; every other set takes all. */
	private _endgameFilter(): (entry: PuzzleEntry) => boolean {
		const choice = this.endgame();
		if (this.type() !== 'endgame' || choice === 'all') return () => true;
		if (choice === 'stalemateTrap') return (entry) => Boolean(entry.stalemateTrap);
		return (entry) => entry.endgame === choice;
	}

	private _present(puzzle: PracticePuzzle) {
		this.run()?.dispose();
		this.outcome.set(null);
		this.current.set(puzzle);
		this.run.set(new PuzzleRun(puzzle.puzzle, this._engine, true));
		this.failed.set(false);
		this.loading.set(false);
		void this._router.navigate([], { queryParams: { id: puzzle.id }, queryParamsHandling: 'merge', replaceUrl: true });
	}

	private _finish(run: PuzzleRun) {
		const puzzle = this.current();
		if (!puzzle) return;
		const solved = run.won();
		if (this.retrying()) {
			this.outcome.set({ solved, delta: null, pawns: 0, retry: true });
			return;
		}
		const award = this.practice.record({ id: puzzle.id, rating: puzzle.puzzle.rating }, solved);
		this._review.record(PUZZLE_KINDS[this.type()], puzzle.id, solved);
		this.session.update((list) => [...list, solved]);
		this.outcome.set({ solved, delta: award?.delta ?? null, pawns: award?.pawns ?? 0, retry: false });
	}
}

function readType(value: unknown): PuzzleType {
	return value === 'mate3' || value === 'mixed' || value === 'endgame' ? value : 'mate1';
}

/** A mate-in-N item as a playable puzzle: one line, mate for the side to move. */
function fromMateItem(item: MateItem): PracticePuzzle {
	const solution = item.line ?? [item.move];
	const moves = Math.ceil(solution.length / 2);
	const line = { uci: solution.join(' '), cp: null, mate: item.side === 'white' ? moves : -moves };
	return {
		id: item.id,
		game: item.game,
		ply: item.ply,
		puzzle: {
			ply: item.ply,
			fen: item.fen,
			side: item.side,
			mode: moves > 1 ? 'line' : 'best',
			target: 1,
			category: 'tactics',
			categories: ['tactics'],
			themes: ['mate', `mateIn${moves}`],
			level: levelOf(item.rating),
			rating: item.rating,
			quality: 0,
			solution: moves > 1 ? solution : [],
			lines: [line],
			played: line,
		},
	};
}
