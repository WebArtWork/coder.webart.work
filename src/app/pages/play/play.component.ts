import { isPlatformBrowser } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, PLATFORM_ID, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, startWith } from 'rxjs';
import { BoardArrow, BoardComponent, BoardMove } from '../../components/board/board.component';
import { PuzzlePanelComponent } from '../../components/puzzle-panel/puzzle-panel.component';
import { DailyRecord } from '../../feature/chess/chess.interface';
import { formatEval } from '../../feature/chess/chess.util';
import { DailyService, todayString } from '../../feature/chess/daily.service';
import { EngineService } from '../../feature/chess/engine.service';
import { PlayMode, PlayModeService } from '../../feature/chess/play-mode.service';
import { filterParams, openingFamily, openingVariation, readFilters } from '../../feature/game/game.const';
import { Puzzle, PuzzleFilters } from '../../feature/game/game.interface';
import { GameService } from '../../feature/game/game.service';
import { PuzzleRun } from '../../feature/game/puzzle.run';
import { TPipe } from '../../feature/i18n/t.pipe';
import { ReviewService } from '../../feature/practice/review.service';
import { PAWNS } from '../../feature/progress/progress.const';
import { Award, ProgressService } from '../../feature/progress/progress.service';

@Component({
	imports: [BoardComponent, PuzzlePanelComponent, RouterLink, TPipe],
	templateUrl: './play.component.html',
})
export class PlayComponent {
	private readonly _games = inject(GameService);
	private readonly _engine = inject(EngineService);
	private readonly _daily = inject(DailyService);
	private readonly _router = inject(Router);
	private readonly _route = inject(ActivatedRoute);
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly _playMode = inject(PlayModeService);
	private readonly _progress = inject(ProgressService);
	private readonly _review = inject(ReviewService);

	protected readonly today = todayString();
	protected readonly mode = this._playMode.mode;
	protected readonly puzzle = signal<Puzzle | null>(null);
	protected readonly run = signal<PuzzleRun | null>(null);
	protected readonly record = signal<DailyRecord | null>(null);
	/** What the finished attempt earned. */
	protected readonly award = signal<Award | null>(null);
	protected readonly loading = signal(true);
	protected readonly failed = signal(false);
	/** Random puzzles keep to these filters, e.g. /practice/good-moves?category=endgame. */
	protected readonly filters = signal<PuzzleFilters>(readFilters(this._route.snapshot.queryParamMap));
	protected readonly format = formatEval;
	protected readonly family = openingFamily;
	protected readonly variation = openingVariation;

	protected readonly arrows = computed<BoardArrow[]>(() => {
		const record = this.record();
		if (record) return record.answers.map((move) => ({ from: move.move.slice(0, 2), to: move.move.slice(2, 4), brush: 'green' }));
		return this.run()?.arrows() ?? [];
	});

	/** Where "Next puzzle" goes: another random one with the same filters. */
	protected readonly nextParams = computed(() => filterParams(this.filters()));
	protected readonly hasFilters = computed(() => this.mode() === 'random' && Object.keys(this.nextParams()).length > 0);

	/** What the page currently shows: 'daily' or a puzzle id. */
	private _shown: string | null = null;

	constructor() {
		this._router.events
			.pipe(
				filter((event) => event instanceof NavigationEnd),
				startWith(null),
				takeUntilDestroyed(inject(DestroyRef)),
			)
			.subscribe(() => this._onRoute());

		effect(() => this._playMode.fen.set(this.run()?.fen() ?? null));
		inject(DestroyRef).onDestroy(() => {
			this._playMode.fen.set(null);
			this.run()?.dispose();
		});

		effect(() => {
			const run = this.run();
			if (!run?.done()) return;
			untracked(() => (this.mode() === 'daily' ? this._saveDaily(run) : this._earn(run)));
		});
	}

	protected onMove({ from, to, promotion }: BoardMove) {
		this.run()?.submit(from, to, promotion);
	}

	private _onRoute() {
		const child = this._route.snapshot.firstChild;
		const mode: PlayMode = child?.data['mode'] === 'random' ? 'random' : 'daily';
		this.mode.set(mode);
		if (!this._isBrowser || !child) return;

		if (mode === 'daily') {
			if (this._shown !== 'daily') void this._open('daily', () => this._games.daily(this.today), true);
			return;
		}

		const params = this._route.snapshot.queryParamMap;
		this.filters.set(readFilters(params));
		const id = params.get('id');
		if (id) {
			if (this._shown !== id) void this._open(id, () => this._games.puzzle(id));
		} else {
			void this._openNewRandom();
		}
	}

	private async _openNewRandom() {
		this._reset();
		// Play is about finding several good moves; single-answer puzzles live in puzzle practice
		const puzzle = await this._games.random({ ...this.filters(), mode: ['candidates'] }, this.puzzle()?.id);
		if (!puzzle) {
			this._showFailed();
			return;
		}
		// replaces /practice/good-moves with ?id=ID; the id is already shown, so the route change is a no-op
		this._shown = puzzle.id;
		await this._router.navigate(['/practice/good-moves'], {
			queryParams: { ...filterParams(this.filters()), id: puzzle.id },
			replaceUrl: true,
		});
		this._present(puzzle, false);
	}

	private async _open(key: string, load: () => Promise<Puzzle | null>, daily = false) {
		this._reset();
		this._shown = key;
		const puzzle = await load();
		if (!puzzle) {
			this._showFailed();
			return;
		}
		this._present(puzzle, daily);
	}

	private _reset() {
		this.loading.set(true);
		this.failed.set(false);
		this.run()?.dispose();
		this.run.set(null);
		this.record.set(null);
		this.award.set(null);
	}

	private _showFailed() {
		this.puzzle.set(null);
		this.failed.set(true);
		this.loading.set(false);
	}

	private _present(puzzle: Puzzle, daily: boolean) {
		this.puzzle.set(puzzle);
		const played = daily ? this._daily.get(this.today) : null;
		if (played) this.record.set(played);
		else this.run.set(new PuzzleRun(puzzle.puzzle, this._engine));
		this.loading.set(false);
	}

	private _saveDaily(run: PuzzleRun) {
		const puzzle = this.puzzle();
		if (!puzzle || this._daily.get(this.today)) return;
		const result = run.result();
		this._daily.save({ date: this.today, id: puzzle.id, mode: puzzle.puzzle.mode, ...result });
		// a missed daily comes back through the review queue, as a Good moves puzzle
		this._review.record('goodMoves', puzzle.id, result.won);
		// every 7th day in a row earns a bonus
		const week = this._daily.streaks(this.today).participation % 7 === 0;
		this.award.set(
			this._progress.complete({
				key: `daily-${this.today}`,
				rated: { rating: puzzle.puzzle.rating, score: run.score() },
				pawns: (result.won ? PAWNS.dailyWon : PAWNS.daily) + (week ? PAWNS.weekStreak : 0),
			}),
		);
	}

	/** A random puzzle earns once, on the first attempt. */
	private _earn(run: PuzzleRun) {
		const puzzle = this.puzzle();
		if (!puzzle || this.award()) return;
		this._review.record('goodMoves', puzzle.id, run.won());
		this.award.set(
			this._progress.complete({
				key: puzzle.id,
				rated: { rating: puzzle.puzzle.rating, score: run.score() },
				pawns: run.won() ? PAWNS.puzzleSolved : PAWNS.puzzle,
			}),
		);
	}
}
