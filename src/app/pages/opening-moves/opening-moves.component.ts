import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { BoardComponent, BoardMove } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { EngineService } from '../../feature/chess/engine.service';
import { GameService } from '../../feature/game/game.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { OpeningItem } from '../../feature/practice/practice.interface';
import { isGoodMove, play, uciOf } from '../../feature/practice/practice.util';

const PRINCIPLES: Record<string, string> = {
	castle: 'Castle: the king gets safe and a rook joins the game',
	develop: 'Develop a piece from the back rank',
	centre: 'Take or control the centre',
	material: 'Win material the opponent left loose',
};

/**
 * Opening moves, from moves 4–12 of real games where the player went wrong: find a move that
 * follows the opening's rules of thumb, or spot which of two moves is the mistake. Each position
 * always asks the same way, so a review asks it again.
 */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './opening-moves.component.html',
})
export class OpeningMovesComponent {
	private readonly _games = inject(GameService);
	private readonly _engine = inject(EngineService);
	private readonly _i18n = inject(I18nService);
	protected readonly flow = new PracticeFlow<OpeningItem>('opening', () => this._games.practiceItems('opening'));

	protected readonly checking = signal(false);
	protected readonly fen = signal('');
	protected readonly last = signal<{ from: string; to: string } | null>(null);
	protected readonly played = signal<string | null>(null);

	/** 'find': play a good move; 'spot': pick the mistake out of two moves. */
	protected readonly mode = computed(() => {
		const id = this.flow.item()?.id ?? '';
		let hash = 0;
		for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
		return hash % 2 ? 'spot' : 'find';
	});
	/** The game's mistake and the best move, in a stable order. */
	protected readonly pair = computed(() => {
		const item = this.flow.item();
		if (!item) return [];
		const pair = [item.played, item.lines[0]];
		return item.id.length % 2 ? pair : pair.reverse();
	});
	protected readonly goodSans = computed(() => {
		const item = this.flow.item();
		return item ? item.lines.filter((line) => item.answers.includes(line.uci)).map((line) => line.san).join(', ') : '';
	});
	protected readonly principles = computed(() => (this.flow.item()?.principles ?? []).map((tag) => this._i18n.t(PRINCIPLES[tag] ?? tag)));
	protected readonly moveNumber = computed(() => {
		const item = this.flow.item();
		return item ? Math.floor(item.ply / 2) + 1 : 0;
	});

	constructor() {
		effect(() => {
			const item = this.flow.item();
			if (!item) return;
			untracked(() => {
				this.fen.set(item.fen);
				this.last.set(null);
				this.played.set(null);
				this.checking.set(false);
			});
		});
	}

	protected async onMove(move: BoardMove) {
		const item = this.flow.item();
		if (!item || this.mode() !== 'find' || this.checking() || this.flow.outcome()) return;
		const uci = uciOf(move);
		const after = play(item.fen, uci);
		if (!after) return;
		this.fen.set(after.fen);
		this.last.set({ from: after.from, to: after.to });
		this.played.set(after.san);
		this.checking.set(true);
		const good = await isGoodMove(this._engine, item.fen, uci, item.answers, item.lines[0]);
		if (this.flow.item()?.id !== item.id) return;
		this.checking.set(false);
		this.flow.finish(good);
	}

	protected pick(uci: string) {
		const item = this.flow.item();
		if (!item || this.flow.outcome()) return;
		this.flow.finish(uci === item.played.uci);
	}
}
