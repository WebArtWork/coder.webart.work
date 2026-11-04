import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BoardArrow, BoardComponent, BoardMove } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { EngineService } from '../../feature/chess/engine.service';
import { GameService } from '../../feature/game/game.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { ThreatItem } from '../../feature/practice/practice.interface';
import { formatLine, isGoodMove, passedFen, play, sanOf, uciOf } from '../../feature/practice/practice.util';

type Step = 'threat' | 'answer' | 'checking' | 'done';

/**
 * What's the threat? First play the opponent's threat, as if it were their move again; then find
 * a move that deals with it. Half the score for each.
 */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './threats.component.html',
})
export class ThreatsComponent {
	private readonly _games = inject(GameService);
	private readonly _engine = inject(EngineService);
	protected readonly flow = new PracticeFlow<ThreatItem>('threat', () => this._games.practiceItems('threat'));

	protected readonly step = signal<Step>('threat');
	protected readonly threatFound = signal(false);
	protected readonly answerGood = signal(false);
	/** The move just played on the board, for its highlight. */
	protected readonly last = signal<{ from: string; to: string } | null>(null);
	protected readonly fen = signal('');

	protected readonly passed = computed(() => {
		const item = this.flow.item();
		return item ? passedFen(item.fen) : '';
	});
	protected readonly arrows = computed<BoardArrow[]>(() => {
		const item = this.flow.item();
		if (!item || this.step() === 'threat') return [];
		return [{ from: item.threat.slice(0, 2), to: item.threat.slice(2, 4), brush: 'red' }];
	});
	protected readonly threatSan = computed(() => {
		const item = this.flow.item();
		return item ? sanOf(this.passed(), item.threat) : '';
	});
	protected readonly threatLine = computed(() => {
		const item = this.flow.item();
		return item ? formatLine(this.passed(), item.line) : '';
	});
	protected readonly answerSans = computed(() => {
		const item = this.flow.item();
		return item ? item.answers.map((uci) => sanOf(item.fen, uci)).join(', ') : '';
	});

	constructor() {
		// every new item, or a retry, starts at the first step
		effect(() => {
			const item = this.flow.item();
			if (!item) return;
			untracked(() => {
				this.step.set('threat');
				this.threatFound.set(false);
				this.answerGood.set(false);
				this.last.set(null);
				this.fen.set(passedFen(item.fen));
			});
		});
	}

	protected async onMove(move: BoardMove) {
		const item = this.flow.item();
		if (!item) return;
		const uci = uciOf(move);
		if (this.step() === 'threat') {
			if (!play(this.fen(), uci)) return;
			this.threatFound.set(item.threats.includes(uci));
			// back to the real position, the threat shown as an arrow
			this.fen.set(item.fen);
			this.last.set(null);
			this.step.set('answer');
			return;
		}
		if (this.step() !== 'answer') return;
		const after = play(item.fen, uci);
		if (!after) return;
		this.fen.set(after.fen);
		this.last.set({ from: after.from, to: after.to });
		this.step.set('checking');
		const good = await isGoodMove(this._engine, item.fen, uci, item.answers, item);
		if (this.flow.item()?.id !== item.id) return;
		this.answerGood.set(good);
		this.step.set('done');
		const score = (this.threatFound() ? 0.5 : 0) + (good ? 0.5 : 0);
		this.flow.finish(score === 1, score);
	}
}
