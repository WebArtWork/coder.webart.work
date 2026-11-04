import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../../feature/i18n/t.pipe';
import { ProgressService } from '../../feature/progress/progress.service';

/**
 * The frame of a practice page. On phones the board is pinned above the footer and the panel
 * scrolls above it; on large screens the board is on the left and the panel on the right. Shows
 * the loading, failed and empty states, the rating and this visit's results; the page projects
 * `[panel]` and `[board]`.
 */
@Component({
	selector: 'app-practice-layout',
	imports: [RouterLink, TPipe],
	template: `
		<section
			class="mx-auto flex h-full w-full max-w-[72rem] flex-col lg:grid lg:h-full lg:grid-cols-[minmax(0,34rem)_1fr] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-8 lg:px-6 lg:pb-4 lg:pt-3"
		>
			<h1 class="sr-only">{{ title() | t }}</h1>

			@if (loading()) {
				<div
					class="mx-auto my-auto aspect-square w-[min(100%,46dvh)] animate-pulse bg-soft sm:rounded-xl lg:w-[min(100%,calc(100dvh-8.5rem))]"
					role="status"
					[attr.aria-label]="'Loading position' | t"
				></div>
			} @else if (failed()) {
				<div class="ds-card m-4 items-start gap-3 p-5 lg:col-span-2 lg:m-0">
					<p>{{ 'Could not load the positions. Check your connection and try again.' | t }}</p>
					<button class="ds-btn ds-btn-primary" type="button" (click)="reload.emit()">{{ 'Try again' | t }}</button>
				</div>
			} @else if (empty()) {
				<div class="ds-card m-4 items-start gap-3 p-5 lg:col-span-2 lg:m-0">
					<p>{{ 'No positions for this practice yet. Try another practice in the meantime.' | t }}</p>
					<a class="ds-btn ds-btn-primary" routerLink="/practice">{{ 'Go to Practice' | t }}</a>
				</div>
			} @else {
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-[3px] lg:order-2 lg:overflow-y-auto lg:p-0">
					<div class="flex flex-col gap-3">
						<div class="flex items-center justify-between gap-3">
							<p class="flex items-baseline gap-2">
								<span class="text-sm text-mute">{{ (reviewing() ? 'Review' : 'Your rating') | t }}</span>
								@if (!reviewing()) {
									<span class="text-xl font-semibold tracking-tight">{{ player.progress().rating }}{{ player.provisional() ? '?' : '' }}</span>
								}
							</p>
							@if (strip().length) {
								<ol class="flex gap-1" [attr.aria-label]="'Results this session' | t">
									@for (solved of strip(); track $index) {
										<li class="size-3 rounded-sm" [class]="solved ? 'bg-ok' : 'bg-danger'">
											<span class="sr-only">{{ (solved ? 'Solved' : 'Missed') | t }}</span>
										</li>
									}
								</ol>
							}
						</div>
						<ng-content select="[panel]" />
					</div>
				</div>

				<div class="shrink-0 pb-2 lg:order-1 lg:self-start lg:pb-0">
					<div class="mx-auto w-[min(100%,46dvh)] lg:mx-0 lg:w-[min(100%,calc(100dvh-8.5rem))]">
						<ng-content select="[board]" />
					</div>
				</div>
			}
		</section>
	`,
})
export class PracticeLayoutComponent {
	protected readonly player = inject(ProgressService);

	readonly title = input.required<string>();
	readonly loading = input(false);
	readonly failed = input(false);
	readonly empty = input(false);
	readonly reviewing = input(false);
	readonly strip = input<boolean[]>([]);
	readonly reload = output();
}
