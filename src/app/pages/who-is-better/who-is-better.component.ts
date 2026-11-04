import { Component, computed, inject, signal } from '@angular/core';
import { BoardComponent } from '../../components/board/board.component';
import { PracticeLayoutComponent } from '../../components/practice-layout/practice-layout.component';
import { PracticeResultComponent } from '../../components/practice-result/practice-result.component';
import { formatEval } from '../../feature/chess/chess.util';
import { GameService } from '../../feature/game/game.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeFlow } from '../../feature/practice/practice.flow';
import { EvalItem, Imbalance } from '../../feature/practice/practice.interface';

type Band = EvalItem['band'];

const CHOICES: { value: Band; label: string }[] = [
	{ value: 'white', label: 'White is better' },
	{ value: 'equal', label: 'About equal' },
	{ value: 'black', label: 'Black is better' },
];

const IMBALANCE_LABELS: Record<Imbalance, string> = {
	material: 'More material',
	bishopPair: 'The bishop pair',
	passedPawn: 'More passed pawns',
	pawnWeaknesses: 'Fewer pawn weaknesses',
	development: 'Better development',
	space: 'More space',
};

/** Who is better? A quiet position: judge it, then see the engine's score and the imbalances. */
@Component({
	imports: [BoardComponent, PracticeLayoutComponent, PracticeResultComponent, TPipe],
	templateUrl: './who-is-better.component.html',
})
export class WhoIsBetterComponent {
	private readonly _games = inject(GameService);
	private readonly _i18n = inject(I18nService);
	protected readonly flow = new PracticeFlow<EvalItem>('eval', () => this._games.practiceItems('eval'));
	protected readonly choices = CHOICES;
	protected readonly picked = signal<Band | null>(null);

	protected readonly verdict = computed(() => CHOICES.find((choice) => choice.value === this.flow.item()?.band)?.label ?? '');
	protected readonly score = computed(() => formatEval((this.flow.item()?.cp ?? 0) / 100));
	protected readonly imbalances = computed(() =>
		(this.flow.item()?.imbalances ?? []).map((item) => ({
			text: this._i18n.t(IMBALANCE_LABELS[item.kind]),
			side: item.side === 'white' ? this._i18n.t('White') : this._i18n.t('Black'),
		})),
	);

	protected choose(band: Band) {
		const item = this.flow.item();
		if (!item || this.flow.outcome()) return;
		this.picked.set(band);
		this.flow.finish(band === item.band);
	}

	protected next() {
		this.picked.set(null);
		this.flow.next();
	}

	protected retry() {
		this.picked.set(null);
		this.flow.retry();
	}
}
