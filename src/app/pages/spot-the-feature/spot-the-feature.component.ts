import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BoardComponent, SquareMark } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { GameService } from '../../feature/game/game.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { FeatureItem, FeatureKind } from '../../feature/practice/practice.interface';

/** What to tap, and what the feature is, per feature. */
const QUESTIONS: Record<FeatureKind, { task: string; rule: string }> = {
	isolated: { task: 'Tap every isolated pawn of {side}.', rule: 'An isolated pawn has no pawns of its own side on the files next to it.' },
	doubled: { task: 'Tap every doubled pawn of {side}.', rule: 'Doubled pawns are two or more pawns of one side on the same file.' },
	backward: {
		task: 'Tap every backward pawn of {side}.',
		rule: 'A backward pawn has no pawn beside or behind it on the next files to guard it, and an enemy pawn controls the square in front of it.',
	},
	passed: { task: 'Tap every passed pawn of {side}.', rule: 'A passed pawn has no enemy pawns in front of it on its own file or the files next to it.' },
	outposts: {
		task: 'Tap every outpost square for {side}.',
		rule: 'An outpost is a square in the opponent’s half (5th–6th rank for White, 4th–3rd for Black), guarded by a pawn, that no enemy pawn can ever attack. b- to g-file.',
	},
	halfOpen: { task: 'Tap a square on every half-open file for {side}.', rule: 'A half-open file has no pawns of that side, but at least one enemy pawn.' },
	openFiles: { task: 'Tap a square on every open file.', rule: 'An open file has no pawns at all.' },
};

const FILES = 'abcdefgh';

/** Spot the feature: tap the squares of a pawn weakness, outpost or file. Answers come from the board alone. */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './spot-the-feature.component.html',
})
export class SpotTheFeatureComponent {
	private readonly _games = inject(GameService);
	private readonly _i18n = inject(I18nService);
	protected readonly flow = new PracticeFlow<FeatureItem>('feature', () => this._games.practiceItems('feature'));

	/** Squares tapped, or files for the file questions. */
	protected readonly picks = signal<string[]>([]);

	protected readonly files = computed(() => {
		const feature = this.flow.item()?.feature;
		return feature === 'openFiles' || feature === 'halfOpen';
	});
	protected readonly task = computed(() => {
		const item = this.flow.item();
		if (!item) return '';
		const side = this._i18n.t(item.color === 'black' ? 'Black' : 'White');
		return this._i18n.t(QUESTIONS[item.feature].task, { side });
	});
	protected readonly rule = computed(() => {
		const item = this.flow.item();
		return item ? QUESTIONS[item.feature].rule : '';
	});
	protected readonly marks = computed<Record<string, SquareMark>>(() => {
		const item = this.flow.item();
		if (!item) return {};
		const done = Boolean(this.flow.outcome());
		const squares = (value: string) => (this.files() ? [...'12345678'].map((rank) => `${value}${rank}`) : [value]);
		const marks: Record<string, SquareMark> = {};
		if (done) for (const answer of item.answers) for (const square of squares(answer)) marks[square] = 'answer';
		for (const pick of this.picks()) {
			for (const square of squares(pick)) marks[square] = !done ? 'pick' : item.answers.includes(pick) ? 'ok' : 'miss';
		}
		return marks;
	});
	protected readonly answerText = computed(() => {
		const item = this.flow.item();
		if (!item) return '';
		return this.files() ? item.answers.map((file) => this._i18n.t('{file}-file', { file })).join(', ') : item.answers.join(', ');
	});

	constructor() {
		effect(() => {
			this.flow.item();
			untracked(() => this.picks.set([]));
		});
	}

	protected tap(square: string) {
		if (this.flow.outcome()) return;
		const value = this.files() ? square[0] : square;
		if (this.files() && !FILES.includes(value)) return;
		this.picks.update((list) => (list.includes(value) ? list.filter((pick) => pick !== value) : [...list, value]));
	}

	protected check() {
		const item = this.flow.item();
		if (!item) return;
		const picks = this.picks();
		const hits = picks.filter((pick) => item.answers.includes(pick)).length;
		const wrong = picks.length - hits;
		const solved = hits === item.answers.length && !wrong;
		this.flow.finish(solved, Math.max(0, (hits - wrong) / item.answers.length));
	}
}
