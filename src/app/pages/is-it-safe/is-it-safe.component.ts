import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BoardArrow, BoardComponent, BoardMove } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { EngineService } from '../../feature/chess/engine.service';
import { GameService } from '../../feature/game/game.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { SafeItem } from '../../feature/practice/practice.interface';
import { formatLine, isGoodMove, play, uciOf } from '../../feature/practice/practice.util';

type Step = 'ask' | 'refute' | 'checking' | 'done';

/**
 * Is it safe? A capture or check is shown: play it or not. When it is not safe, play the
 * opponent's refutation too; half the score for each part.
 */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './is-it-safe.component.html',
})
export class IsItSafeComponent {
	private readonly _games = inject(GameService);
	private readonly _engine = inject(EngineService);
	protected readonly flow = new PracticeFlow<SafeItem>('safe', () => this._games.practiceItems('safe'));

	protected readonly step = signal<Step>('ask');
	protected readonly saidSafe = signal<boolean | null>(null);
	protected readonly refuted = signal(false);
	protected readonly fen = signal('');
	protected readonly last = signal<{ from: string; to: string } | null>(null);

	/** The position after the move, where the refutation is played. */
	protected readonly after = computed(() => {
		const item = this.flow.item();
		return item ? play(item.fen, item.move) : null;
	});
	protected readonly arrows = computed<BoardArrow[]>(() => {
		const item = this.flow.item();
		if (!item || this.step() !== 'ask') return [];
		return [{ from: item.move.slice(0, 2), to: item.move.slice(2, 4), brush: 'blue' }];
	});
	protected readonly refutation = computed(() => {
		const item = this.flow.item();
		const after = this.after();
		return item && after && item.refutation.length ? formatLine(after.fen, item.refutation) : '';
	});

	constructor() {
		effect(() => {
			const item = this.flow.item();
			if (!item) return;
			untracked(() => {
				this.step.set('ask');
				this.saidSafe.set(null);
				this.refuted.set(false);
				this.fen.set(item.fen);
				this.last.set(null);
			});
		});
	}

	protected answer(safe: boolean) {
		const item = this.flow.item();
		const after = this.after();
		if (!item || !after || this.step() !== 'ask') return;
		this.saidSafe.set(safe);
		if (item.safe || safe) {
			this.step.set('done');
			this.flow.finish(item.safe === safe);
			return;
		}
		// right, it is not safe: now show why
		this.fen.set(after.fen);
		this.last.set({ from: after.from, to: after.to });
		this.step.set('refute');
	}

	protected async onMove(move: BoardMove) {
		const item = this.flow.item();
		const after = this.after();
		if (!item || !after || this.step() !== 'refute') return;
		const uci = uciOf(move);
		const reply = play(after.fen, uci);
		if (!reply) return;
		this.fen.set(reply.fen);
		this.last.set({ from: reply.from, to: reply.to });
		this.step.set('checking');
		const good = await isGoodMove(this._engine, after.fen, uci, item.refutation.slice(0, 1), item);
		if (this.flow.item()?.id !== item.id) return;
		this.refuted.set(good);
		this.step.set('done');
		this.flow.finish(good, good ? 1 : 0.5);
	}
}
