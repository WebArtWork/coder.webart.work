import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BoardArrow, BoardComponent, BoardMove } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { formatEval } from '../../feature/chess/chess.util';
import { EngineService } from '../../feature/chess/engine.service';
import { GameService } from '../../feature/game/game.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { SacrificeItem } from '../../feature/practice/practice.interface';
import { isGoodMove, pawns, play, uciOf } from '../../feature/practice/practice.util';

type Verdict = SacrificeItem['verdict'];
type Step = 'judge' | 'reply' | 'checking' | 'done';

const VERDICTS: { value: Verdict; label: string; detail: string }[] = [
	{ value: 'sound', label: 'Sound', detail: 'The evaluation holds: it is about as good as the best move.' },
	{ value: 'unclear', label: 'Unclear', detail: 'Neither: some compensation, but less than the best move keeps.' },
	{ value: 'unsound', label: 'Unsound', detail: 'It does not work: the side that sacrificed ends up worse.' },
];

/**
 * Sound sacrifice? A sacrifice from a real game: judge it, then play the critical reply for the
 * side that has to answer it. Half the score for each part.
 */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './sound-sacrifice.component.html',
})
export class SoundSacrificeComponent {
	private readonly _games = inject(GameService);
	private readonly _engine = inject(EngineService);
	protected readonly flow = new PracticeFlow<SacrificeItem>('sacrifice', () => this._games.practiceItems('sacrifice'));
	protected readonly verdicts = VERDICTS;

	protected readonly step = signal<Step>('judge');
	protected readonly judged = signal<Verdict | null>(null);
	protected readonly replied = signal(false);
	protected readonly fen = signal('');
	protected readonly last = signal<{ from: string; to: string } | null>(null);

	protected readonly after = computed(() => {
		const item = this.flow.item();
		return item ? play(item.fen, item.move) : null;
	});
	protected readonly arrows = computed<BoardArrow[]>(() => {
		const item = this.flow.item();
		if (!item || this.step() !== 'judge') return [];
		return [{ from: item.move.slice(0, 2), to: item.move.slice(2, 4), brush: 'blue' }];
	});
	protected readonly verdict = computed(() => VERDICTS.find((verdict) => verdict.value === this.flow.item()?.verdict));
	protected readonly scores = computed(() => {
		const item = this.flow.item();
		if (!item) return { best: '', move: '' };
		return { best: formatEval(pawns(item.best.cp, item.best.mate)), move: formatEval(pawns(item.cp, item.mate)) };
	});
	protected readonly replySans = computed(() => {
		const item = this.flow.item();
		return item ? item.replies.filter((reply) => item.answers.includes(reply.uci)).map((reply) => reply.san).join(', ') : '';
	});

	constructor() {
		effect(() => {
			const item = this.flow.item();
			if (!item) return;
			untracked(() => {
				this.step.set('judge');
				this.judged.set(null);
				this.replied.set(false);
				this.fen.set(item.fen);
				this.last.set(null);
			});
		});
	}

	protected judge(verdict: Verdict) {
		const after = this.after();
		if (!after || this.step() !== 'judge') return;
		this.judged.set(verdict);
		this.fen.set(after.fen);
		this.last.set({ from: after.from, to: after.to });
		this.step.set('reply');
	}

	protected async onMove(move: BoardMove) {
		const item = this.flow.item();
		const after = this.after();
		if (!item || !after || this.step() !== 'reply') return;
		const uci = uciOf(move);
		const reply = play(after.fen, uci);
		if (!reply) return;
		this.fen.set(reply.fen);
		this.last.set({ from: reply.from, to: reply.to });
		this.step.set('checking');
		const good = await isGoodMove(this._engine, after.fen, uci, item.answers, item.replies[0] ?? null);
		if (this.flow.item()?.id !== item.id) return;
		this.replied.set(good);
		this.step.set('done');
		const score = (this.judged() === item.verdict ? 0.5 : 0) + (good ? 0.5 : 0);
		this.flow.finish(score === 1, score);
	}
}
