import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BoardComponent, SquareMark } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { GameService } from '../../feature/game/game.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { VisualItem } from '../../feature/practice/practice.interface';
import { formatLine, play } from '../../feature/practice/practice.util';

const PIECES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** "wn" → "White knight", "-" → "Empty". */
function pieceName(code: string): string {
	if (code === '-') return 'Empty';
	const side = code[0] === 'w' ? 'White' : 'Black';
	return `${side} ${PIECES[code[1]]}`;
}

/**
 * See it in your head: the board stays put while a few moves are given as text; then a question
 * about the position after them. Answers come from chess.js, so they cannot be wrong.
 */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './see-it.component.html',
})
export class SeeItComponent {
	private readonly _games = inject(GameService);
	private readonly _i18n = inject(I18nService);
	protected readonly flow = new PracticeFlow<VisualItem>('visual', () => this._games.practiceItems('visual'));
	protected readonly pieceName = pieceName;

	protected readonly picks = signal<string[]>([]);
	protected readonly chosen = signal<string | null>(null);

	protected readonly line = computed(() => {
		const item = this.flow.item();
		return item ? formatLine(item.fen, item.moves) : '';
	});
	/** Shown once answered: the position after the moves. */
	protected readonly end = computed(() => {
		const item = this.flow.item();
		if (!item) return null;
		let fen = item.fen;
		let last: { from: string; to: string } | null = null;
		for (const uci of item.moves) {
			const step = play(fen, uci);
			if (!step) break;
			fen = step.fen;
			last = { from: step.from, to: step.to };
		}
		return { fen, last };
	});
	protected readonly prompt = computed(() => {
		const question = this.flow.item()?.question;
		if (!question) return '';
		switch (question.kind) {
			case 'piece':
				return this._i18n.t('After these moves, what stands on {square}?', { square: question.square });
			case 'attacked':
				return this._i18n.t(question.by === 'white' ? 'After these moves, does White attack {square}?' : 'After these moves, does Black attack {square}?', {
					square: question.square,
				});
			case 'moves':
				return this._i18n.t('After these moves, where can the {piece} on {square} go? Tap every square.', {
					piece: this._i18n.t(question.piece),
					square: question.square,
				});
			default:
				question satisfies never;
				return '';
		}
	});
	protected readonly answerText = computed(() => {
		const question = this.flow.item()?.question;
		if (!question) return '';
		if (question.kind === 'piece') return this._i18n.t(pieceName(question.answer));
		if (question.kind === 'attacked') return this._i18n.t(question.answer ? 'Yes' : 'No');
		return question.answer.join(', ');
	});
	protected readonly marks = computed<Record<string, SquareMark>>(() => {
		const question = this.flow.item()?.question;
		if (question?.kind !== 'moves') {
			return question && this.flow.outcome() ? { [question.square]: 'answer' } : {};
		}
		const done = Boolean(this.flow.outcome());
		const marks: Record<string, SquareMark> = {};
		if (done) for (const square of question.answer) marks[square] = 'answer';
		for (const pick of this.picks()) marks[pick] = !done ? 'pick' : question.answer.includes(pick) ? 'ok' : 'miss';
		return marks;
	});

	constructor() {
		effect(() => {
			this.flow.item();
			untracked(() => {
				this.picks.set([]);
				this.chosen.set(null);
			});
		});
	}

	protected choose(value: string) {
		const question = this.flow.item()?.question;
		if (!question || this.flow.outcome()) return;
		this.chosen.set(value);
		if (question.kind === 'piece') this.flow.finish(value === question.answer);
		else if (question.kind === 'attacked') this.flow.finish((value === 'yes') === question.answer);
	}

	protected tap(square: string) {
		if (this.flow.outcome()) return;
		this.picks.update((list) => (list.includes(square) ? list.filter((pick) => pick !== square) : [...list, square]));
	}

	protected check() {
		const question = this.flow.item()?.question;
		if (question?.kind !== 'moves') return;
		const picks = this.picks();
		const hits = picks.filter((pick) => question.answer.includes(pick)).length;
		const wrong = picks.length - hits;
		this.flow.finish(hits === question.answer.length && !wrong, Math.max(0, (hits - wrong) / question.answer.length));
	}
}
