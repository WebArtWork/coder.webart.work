import { Component, computed, inject, signal } from '@angular/core';
import { BoardArrow, BoardComponent, SquareMark } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { BASICS_TOPICS, BasicsChoice, basicsItems, BasicsItem, BasicsTopic } from '../../feature/practice/basics';
import { PracticeFlow } from '../../feature/practice/practice.flow';

/**
 * Chess basics: multiple-choice questions on how the pieces move, what they are worth and how moves
 * are written, for players who are just starting. Notation stays English in every language; the
 * question texts are translated in /i18n/pages/chess-basics/.
 */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './chess-basics.component.html',
})
export class ChessBasicsComponent {
	private readonly _i18n = inject(I18nService);

	protected readonly topics = BASICS_TOPICS;
	protected readonly topic = signal<BasicsTopic | 'all'>('all');
	protected readonly flow = new PracticeFlow<BasicsItem>(
		'basics',
		async () => basicsItems(),
		() => {
			const topic = this.topic();
			return (item) => topic === 'all' || item.topic === topic;
		},
	);
	protected readonly chosen = signal<number | null>(null);

	protected readonly question = computed(() => {
		const item = this.flow.item();
		return item ? this._i18n.t(item.question, item.vars) : '';
	});
	protected readonly marks = computed<Record<string, SquareMark>>(() => {
		const item = this.flow.item();
		if (!item) return {};
		const marks: Record<string, SquareMark> = {};
		if (this.flow.outcome()) for (const square of item.reveal ?? []) marks[square] = 'answer';
		for (const square of item.marks ?? []) marks[square] = 'pick';
		return marks;
	});
	protected readonly arrows = computed<BoardArrow[]>(() => {
		const arrow = this.flow.item()?.arrow;
		return arrow ? [{ ...arrow, brush: 'blue' }] : [];
	});
	protected readonly answerText = computed(() => {
		const item = this.flow.item();
		return item ? this.label(item, item.choices[item.answer]) : '';
	});

	constructor() {
		this._i18n.usePage('/i18n/pages/chess-basics/');
	}

	protected label(item: BasicsItem, choice: BasicsChoice): string {
		return item.literal ? choice.label : this._i18n.t(choice.label, choice.vars);
	}

	protected choose(index: number) {
		const item = this.flow.item();
		if (!item || this.flow.outcome()) return;
		this.chosen.set(index);
		this.flow.finish(index === item.answer);
	}

	protected pickTopic(topic: BasicsTopic | 'all') {
		this.topic.set(topic);
		this.next();
	}

	protected next() {
		this.chosen.set(null);
		this.flow.next();
	}

	protected retry() {
		this.chosen.set(null);
		this.flow.retry();
	}
}
