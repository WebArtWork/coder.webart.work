import { Component, computed, input } from '@angular/core';
import { CATEGORY_LABELS, instruction, LEVEL_LABELS, LEVEL_RANGES, MODE_LABELS, themeLabel } from '../../feature/game/game.const';
import { PuzzleRun, RunMessage } from '../../feature/game/puzzle.run';
import { TPipe } from '../../feature/i18n/t.pipe';
import { Award } from '../../feature/progress/progress.service';
import { GamePanelComponent } from '../game-panel/game-panel.component';
import { LinePanelComponent } from '../line-panel/line-panel.component';

/**
 * A puzzle's task and progress, whatever its exercise. Themes stay hidden until it is finished,
 * since they would give the answer away. Content marked `actions` shows once it is finished, and
 * so does `award`, what the attempt earned.
 */
@Component({
	selector: 'app-puzzle-panel',
	imports: [GamePanelComponent, LinePanelComponent, TPipe],
	template: `
		@let current = run();
		<div class="flex flex-col gap-[3px]">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="ds-badge">{{ modeLabel() | t }}</span>
				<span class="ds-badge">{{ categoryLabel() | t }}</span>
				<span class="ds-badge" [attr.title]="'Estimated training level {range}' | t: { range: levelRange() }">{{ levelLabel() | t }}</span>
				@if (current.done()) {
					@for (theme of themes(); track theme) {
						<span class="ds-badge ds-badge-verified">{{ theme | t }}</span>
					}
					@if (award(); as earned) {
						@if (earned.pawns) {
							<span class="ds-badge">+{{ earned.pawns }} ♟</span>
						}
						@if (earned.delta !== null) {
							<span class="ds-badge" [class]="earned.delta >= 0 ? 'ds-badge-safe' : 'ds-badge-danger'" [attr.title]="'Rating change' | t">
								{{ earned.delta >= 0 ? '+' : '' }}{{ earned.delta }}
							</span>
						}
					}
				}
			</div>
			<div class="flex items-center justify-between gap-3">
				@let message = current.outcome() ?? task();
				<p class="text-sm font-medium" role="status">{{ message.text | t: message.vars }}</p>
				<p
					class="flex shrink-0 items-center gap-1.5"
					[attr.aria-label]="'{used} of {count} strike used|{used} of {count} strikes used' | t: { used: current.strikes(), count: current.maxStrikes }"
				>
					@for (used of pips(); track $index) {
						<span class="size-2.5 rounded-full border-2" [class]="used ? 'border-danger bg-danger' : 'border-line'" aria-hidden="true"></span>
					}
				</p>
			</div>

			@if (current.line; as line) {
				<app-line-panel [session]="line">
					<ng-container ngProjectAs="[actions]"><ng-content select="[actions]" /></ng-container>
				</app-line-panel>
			} @else if (current.moves; as moves) {
				<app-game-panel [session]="moves">
					<ng-container ngProjectAs="[actions]"><ng-content select="[actions]" /></ng-container>
				</app-game-panel>
			}
		</div>
	`,
})
export class PuzzlePanelComponent {
	readonly run = input.required<PuzzleRun>();
	readonly award = input<Award | null>(null);

	protected readonly task = computed<RunMessage>(() => {
		const puzzle = this.run().puzzle;
		return instruction(puzzle.mode, puzzle.target, puzzle.side);
	});
	protected readonly modeLabel = computed(() => MODE_LABELS[this.run().puzzle.mode]);
	protected readonly categoryLabel = computed(() => CATEGORY_LABELS[this.run().puzzle.category]);
	protected readonly levelLabel = computed(() => LEVEL_LABELS[this.run().puzzle.level]);
	protected readonly levelRange = computed(() => LEVEL_RANGES[this.run().puzzle.level]);
	protected readonly themes = computed(() => this.run().puzzle.themes.map(themeLabel));
	protected readonly pips = computed(() => {
		const run = this.run();
		return Array.from({ length: run.maxStrikes }, (_, i) => i < run.strikes());
	});
}
