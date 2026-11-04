import { afterNextRender, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon.component';
import { AuthService } from '../../feature/auth/auth.service';
import { DailyRecord } from '../../feature/chess/chess.interface';
import { DailyService, DayState, RecentDay, todayString } from '../../feature/chess/daily.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { SOURCE_URL } from '../../feature/legal/legal.const';
import { DAILY_MINUTES, PlanDay, WEEK_PLAN } from '../../feature/plan/plan.const';

interface Progress {
	days: RecentDay[];
	/** Consecutive days played, won or not. */
	playedStreak: number;
	found: number | null;
}

/** Shown to signed-out visitors, with the same shape as the real numbers. */
const SAMPLE_STATES: DayState[] = ['won', 'won', 'played', 'won', 'none', 'won', 'won'];
const SAMPLE_FOUND = 72;
const SAMPLE_PLAYED_STREAK = 2;

@Component({
	imports: [IconComponent, RouterLink, TPipe],
	templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
	private readonly _auth = inject(AuthService);
	private readonly _daily = inject(DailyService);
	private readonly _i18n = inject(I18nService);

	protected readonly week = WEEK_PLAN;
	protected readonly sourceUrl = SOURCE_URL;
	protected readonly dailyMinutes = DAILY_MINUTES;
	protected readonly today = todayString();

	/** 0 = Sunday. Known only in the browser, so prerender never bakes in a weekday. */
	protected readonly weekday = signal<number | null>(null);
	/** Today's daily result, read in the browser; null until it is played. */
	private readonly _record = signal<DailyRecord | null>(null);
	protected readonly dailyDone = computed(() => !!this._record());
	/** How today's daily puzzle went, e.g. "Solved"; null until it is played. */
	protected readonly dailyResult = computed<string | null>(() => {
		const record = this._record();
		if (!record) return null;
		return record.won
			? this._i18n.t('Solved')
			: this._i18n.t('{hits} of {target} found', { hits: record.hits, target: record.target });
	});

	protected readonly user = this._auth.user;
	protected readonly ready = computed(() => this.user() !== undefined);
	protected readonly isGuest = computed(() => this.user() === null);
	protected readonly todayPlan = computed<PlanDay | null>(
		() => this.week.find((day) => day.day === this.weekday()) ?? null,
	);

	protected readonly progress = computed<Progress | null>(() => {
		if (!this.ready()) return null;
		const days = this._daily.recent(this.today, 7);

		if (this.isGuest()) {
			return {
				days: days.map((day, i) => ({ ...day, state: SAMPLE_STATES[i] })),
				playedStreak: SAMPLE_PLAYED_STREAK,
				found: SAMPLE_FOUND,
			};
		}

		return {
			days,
			playedStreak: this._daily.streaks(this.today).participation,
			found: this._daily.averageFound(days),
		};
	});

	constructor() {
		afterNextRender(() => {
			this.weekday.set(new Date().getDay());
			this._record.set(this._daily.get(this.today));
			void this._auth.whenReady();
		});
	}

	protected dayLabel(state: DayState): string {
		switch (state) {
			case 'won':
				return 'solved';
			case 'played':
				return 'played';
			case 'none':
				return 'not played';
			default:
				state satisfies never;
				return '';
		}
	}
}
