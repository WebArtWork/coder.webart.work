import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, Service } from '@angular/core';
import { DailyRecord } from './chess.interface';

const STORAGE_KEY = 'wawchess_daily';

/** Today's date in UTC, `YYYY-MM-DD`: the key of the daily puzzle. */
export function todayString(): string {
	return new Date().toISOString().split('T')[0];
}

export interface DailyStreaks {
	participation: number;
	win: number;
}

export type DayState = 'won' | 'played' | 'none';

export interface RecentDay {
	date: string;
	weekday: string;
	state: DayState;
}

/** Lifetime totals, for the profile. */
export interface DailySummary {
	played: number;
	won: number;
	/** Longest run of consecutive won days ever. */
	bestWin: number;
	/** Average share of top moves found across every played day, 0 to 100; null when nothing was played. */
	found: number | null;
}

/** Daily results and streaks, stored in the browser only. */
@Service()
export class DailyService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

	get(date: string): DailyRecord | null {
		return this._load()[date] ?? null;
	}

	save(record: DailyRecord) {
		const records = this._load();
		records[record.date] = record;
		if (!this._isBrowser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
		} catch {
			/* storage unavailable */
		}
	}

	/** Consecutive days ending today (or yesterday if today is not played yet). */
	streaks(today: string): DailyStreaks {
		const records = this._load();
		const walk = (counts: (record: DailyRecord) => boolean) => {
			const day = new Date(`${today}T00:00:00Z`);
			if (!records[this._key(day)]) day.setUTCDate(day.getUTCDate() - 1);
			let count = 0;
			for (;;) {
				const record = records[this._key(day)];
				if (!record || !counts(record)) return count;
				count++;
				day.setUTCDate(day.getUTCDate() - 1);
			}
		};
		return { participation: walk(() => true), win: walk((record) => record.won) };
	}

	/** Totals across every saved day. */
	summary(): DailySummary {
		const records = this._load();
		const list = Object.values(records);

		let bestWin = 0;
		for (const record of list) {
			if (!record.won) continue;
			const day = new Date(`${record.date}T00:00:00Z`);
			day.setUTCDate(day.getUTCDate() - 1);
			// count each run once, from its first day
			if (records[this._key(day)]?.won) continue;
			let run = 0;
			for (;;) {
				day.setUTCDate(day.getUTCDate() + 1);
				if (!records[this._key(day)]?.won) break;
				run++;
			}
			bestWin = Math.max(bestWin, run);
		}

		return {
			played: list.length,
			won: list.filter((record) => record.won).length,
			bestWin,
			found: this._found(list),
		};
	}

	/** The last `days` days ending today, oldest first, with how each one went. */
	recent(today: string, days: number): RecentDay[] {
		const records = this._load();
		const day = new Date(`${today}T00:00:00Z`);
		day.setUTCDate(day.getUTCDate() - (days - 1));

		const result: RecentDay[] = [];
		for (let i = 0; i < days; i++) {
			const date = this._key(day);
			const record = records[date];
			result.push({
				date,
				weekday: day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
				state: !record ? 'none' : record.won ? 'won' : 'played',
			});
			day.setUTCDate(day.getUTCDate() + 1);
		}
		return result;
	}

	/** Average share of top moves found over the given days, 0 to 100; null when nothing was played. */
	averageFound(days: RecentDay[]): number | null {
		const records = this._load();
		return this._found(days.map((day) => records[day.date]));
	}

	private _found(records: (DailyRecord | undefined)[]): number | null {
		const shares = records
			.filter((record): record is DailyRecord => !!record && record.target > 0)
			.map((record) => record.hits / record.target);
		if (!shares.length) return null;
		return Math.round((100 * shares.reduce((a, b) => a + b, 0)) / shares.length);
	}

	private _key(day: Date): string {
		return day.toISOString().split('T')[0];
	}

	private _load(): Record<string, DailyRecord> {
		if (!this._isBrowser) return {};
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? (JSON.parse(raw) as Record<string, DailyRecord>) : {};
		} catch {
			return {};
		}
	}
}
