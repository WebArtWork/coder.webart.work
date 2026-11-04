import { Component, computed, inject, input } from '@angular/core';
import { Candidate } from '../../feature/chess/chess.interface';
import { formatEval } from '../../feature/chess/chess.util';
import { GameSession } from '../../feature/chess/game.session';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';

interface Slot {
	rank: number;
	san: string | null;
	found: boolean;
}

/**
 * Progress of one candidate game: a ladder of rank slots that fill as top moves
 * are found, strike pips, the guesses so far and, once finished, the engine's answers.
 */
@Component({
	selector: 'app-game-panel',
	imports: [TPipe],
	template: `
		@let game = session();
		<div class="flex flex-col gap-[3px]">
			<section class="flex flex-col gap-[3px]" [attr.aria-label]="'Progress' | t">
				<ol
					class="grid gap-1"
					[style.grid-template-columns]="'repeat(' + game.targetMoves() + ', minmax(0, 1fr))'"
					[attr.aria-label]="'Top moves' | t"
				>
					@for (slot of slots(); track slot.rank) {
						<li
							class="flex h-14 flex-col items-center justify-center rounded-xl px-1 text-center"
							[class]="
								slot.found
									? 'bg-brand text-brand-fg'
									: slot.san
										? 'border border-dashed border-line text-fg'
										: 'border border-line bg-card text-mute'
							"
						>
							<span class="text-[0.6875rem] font-medium leading-none opacity-80">{{ slot.rank }}</span>
							<span class="mt-1 text-sm font-semibold leading-none">{{ slot.san ?? '' }}</span>
							@if (slot.found) {
								<span class="sr-only">{{ 'found' | t }}</span>
							} @else if (slot.san) {
								<span class="sr-only">{{ 'missed' | t }}</span>
							}
						</li>
					}
				</ol>
			</section>

			@if (game.done()) {
				<ng-content select="[actions]" />
			}

			@if (game.candidates().length) {
				<!-- Your guesses: one row of cells (a second row only past five guesses). -->
				<ul class="grid grid-cols-5 gap-1" [attr.aria-label]="'Your guesses' | t">
					@for (candidate of game.candidates(); track candidate.move) {
						<li class="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-line bg-card px-0.5 py-3 text-center">
							<span class="text-base font-semibold leading-none">{{ candidate.san }}</span>
							<span class="ds-badge" [class]="badgeClass(candidate)" [attr.title]="badgeTitle(candidate)">
								{{ badgeText(candidate) }}
								@if (candidate.status === 'hidden_gem' || candidate.status === 'pending') {
									<span class="sr-only">{{ badgeTitle(candidate) }}</span>
								}
							</span>
							@if (candidate.status !== 'pending') {
								<span class="text-xs leading-none text-mute">{{ format(candidate.eval) }}</span>
								@if (candidate.category; as category) {
									<span class="inline-flex items-center gap-1 whitespace-nowrap text-[0.625rem] leading-none text-mute">
										<span
											class="size-1.5 shrink-0 rounded-full"
											[style.background-color]="category.color"
											aria-hidden="true"
										></span>
										{{ category.label | t }}
									</span>
								}
							}
						</li>
					}
				</ul>
			}

			@if (game.done()) {
				<section aria-labelledby="answers-title">
					<h2 id="answers-title" class="mb-2 text-base font-semibold">{{ "Engine's top moves" | t }}</h2>
					<ol class="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
						@for (move of game.answers(); track move.move; let i = $index) {
							<li class="flex gap-3 px-4 py-3">
								<span class="w-4 text-sm text-mute">{{ i + 1 }}</span>
								<span class="min-w-0 flex-1">
									<span class="flex items-baseline justify-between gap-3">
										<span class="font-semibold">{{ move.san }}</span>
										<span class="text-sm text-mute">{{ format(move.rawEval) }}</span>
									</span>
									<span class="mt-0.5 block text-sm text-mute">
										{{ move.line.sans.slice(0, 8).join(' ') }}
									</span>
								</span>
							</li>
						}
					</ol>
				</section>
			}
		</div>
	`,
})
export class GamePanelComponent {
	readonly session = input.required<GameSession>();
	private readonly _i18n = inject(I18nService);

	protected readonly format = formatEval;

	protected readonly slots = computed<Slot[]>(() => {
		const game = this.session();
		const found = new Map<number, string>();
		for (const candidate of game.candidates()) {
			if (candidate.status !== 'hit') continue;
			const rank = game.rankOf(candidate.move);
			if (rank) found.set(rank, candidate.san);
		}

		return Array.from({ length: game.targetMoves() }, (_, i) => {
			const rank = i + 1;
			const foundSan = found.get(rank);
			const reveal = game.done() ? (game.topMoves()[i]?.san ?? null) : null;
			return { rank, san: foundSan ?? reveal, found: !!foundSan };
		});
	});

	protected badgeText(candidate: Candidate): string {
		switch (candidate.status) {
			case 'hit':
				return this._i18n.t('Top {rank}', { rank: this.session().rankOf(candidate.move) });
			case 'hidden_gem':
				return this._i18n.t('Gem');
			case 'miss':
				return this._i18n.t('Miss');
			case 'pending':
				return '…';
			default:
				candidate.status satisfies never;
				return '';
		}
	}

	/** The full meaning of the short badge text. */
	protected badgeTitle(candidate: Candidate): string {
		switch (candidate.status) {
			case 'hit':
				return this._i18n.t('Top {rank} move', { rank: this.session().rankOf(candidate.move) });
			case 'hidden_gem':
				return this._i18n.t('Hidden gem: as good as the top moves');
			case 'miss':
				return this._i18n.t('Not in the top moves');
			case 'pending':
				return this._i18n.t('Checking');
			default:
				candidate.status satisfies never;
				return '';
		}
	}

	protected badgeClass(candidate: Candidate): string {
		switch (candidate.status) {
			case 'hit':
				return 'ds-badge-safe';
			case 'hidden_gem':
				return 'ds-badge-verified';
			case 'miss':
				return 'ds-badge-danger';
			case 'pending':
				return '';
			default:
				candidate.status satisfies never;
				return '';
		}
	}
}
