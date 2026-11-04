import { afterRenderEffect, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeOutcome } from '../../feature/practice/practice.flow';

/**
 * The end of an attempt: right or wrong, what it earned, the explanation the page projects, and
 * Next (which takes focus, so Enter moves on), Retry after a miss, and See the game.
 */
@Component({
	selector: 'app-practice-result',
	imports: [TPipe],
	template: `
		@let result = outcome();
		<section class="ds-card gap-3 p-4" aria-live="polite">
			<div class="flex items-center justify-between gap-3">
				<p class="text-lg font-semibold">{{ (result.solved ? 'Correct' : 'Incorrect') | t }}</p>
				<span class="flex gap-1.5">
					@let award = result.award;
					@if (award && award.pawns) {
						<span class="ds-badge">+{{ award.pawns }} ♟</span>
					}
					@if (award && award.delta !== null) {
						<span class="ds-badge" [class]="award.delta >= 0 ? 'ds-badge-safe' : 'ds-badge-danger'">{{ award.delta >= 0 ? '+' : '' }}{{ award.delta }}</span>
					} @else {
						<span class="ds-badge">{{ (result.retry ? 'Retry, not rated' : 'Played before, not rated') | t }}</span>
					}
				</span>
			</div>
			<ng-content />
			<div class="flex flex-wrap gap-2">
				<button #nextButton class="ds-btn ds-btn-primary" type="button" (click)="next.emit()">
					{{ (reviewing() ? 'Next review' : 'Next') | t }}
				</button>
				@if (!result.solved) {
					<button class="ds-btn ds-btn-outline" type="button" (click)="retry.emit()">{{ 'Retry' | t }}</button>
				}
			</div>
		</section>
	`,
})
export class PracticeResultComponent {
	readonly outcome = input.required<PracticeOutcome>();
	readonly game = input<string | null>(null);
	readonly ply = input(0);
	readonly reviewing = input(false);
	readonly next = output();
	readonly retry = output();

	private readonly _next = viewChild<ElementRef<HTMLElement>>('nextButton');

	constructor() {
		afterRenderEffect(() => this._next()?.nativeElement.focus({ preventScroll: true }));
	}
}
