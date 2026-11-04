import { Component, computed, input } from '@angular/core';
import { LineSession } from '../../feature/chess/line.session';
import { TPipe } from '../../feature/i18n/t.pipe';

interface Ply {
	number: string;
	san: string;
	by: 'you' | 'reply';
}

/**
 * Progress of a play-the-line puzzle: your moves found so far, strike pips, the line as it is
 * played and, once finished, the full solution.
 */
@Component({
	selector: 'app-line-panel',
	imports: [TPipe],
	template: `
		@let line = session();
		<div class="flex flex-col gap-[3px]">
			<section class="flex flex-col gap-[3px]" [attr.aria-label]="'Progress' | t">
				<ol
					class="grid gap-1"
					[style.grid-template-columns]="'repeat(' + line.target + ', minmax(0, 1fr))'"
					[attr.aria-label]="'Your moves in the line' | t"
				>
					@for (slot of slots(); track $index) {
						<li
							class="flex h-14 flex-col items-center justify-center rounded-xl px-1 text-center"
							[class]="
								slot.found ? 'bg-brand text-brand-fg' : slot.san ? 'border border-dashed border-line text-fg' : 'border border-line bg-card text-mute'
							"
						>
							<span class="text-[0.6875rem] font-medium leading-none opacity-80">{{ $index + 1 }}</span>
							<span class="mt-1 text-sm font-semibold leading-none">{{ slot.san }}</span>
							@if (slot.found) {
								<span class="sr-only">{{ 'found' | t }}</span>
							}
						</li>
					}
				</ol>
			</section>

			@if (line.done()) {
				<ng-content select="[actions]" />
			}

			@if (line.misses().length) {
				<p class="text-sm text-mute">
					{{ 'Not it: {moves}' | t: { moves: missList() } }}
				</p>
			}

			@if (line.done()) {
				<section aria-labelledby="solution-title">
					<h2 id="solution-title" class="mb-2 text-base font-semibold">{{ 'Solution' | t }}</h2>
					<ol class="flex flex-wrap gap-x-2 gap-y-1 rounded-xl border border-line bg-card px-4 py-3 text-sm">
						@for (ply of solution(); track $index) {
							<li [class]="ply.by === 'you' ? 'font-semibold' : 'text-mute'">
								<span class="text-mute">{{ ply.number }}</span>
								{{ ply.san }}
							</li>
						}
					</ol>
				</section>
			}
		</div>
	`,
})
export class LinePanelComponent {
	readonly session = input.required<LineSession>();

	protected readonly missList = computed(() =>
		this.session()
			.misses()
			.map((move) => move.san)
			.join(', '),
	);

	/** Your moves: filled as found, revealed when the puzzle ends. */
	protected readonly slots = computed(() => {
		const line = this.session();
		const yours = line.played().filter((move) => move.by === 'you');
		return Array.from({ length: line.target }, (_, i) => {
			const found = yours[i]?.san ?? null;
			const reveal = line.done() ? (line.solutionSans[i * 2] ?? null) : null;
			return { san: found ?? reveal, found: !!found };
		});
	});

	/** The solution with move numbers, e.g. "17. Nd3+ Kf1 18. Qe1#". */
	protected readonly solution = computed<Ply[]>(() => {
		const line = this.session();
		const [, side, , , , fullmove] = line.startFen.split(' ');
		let number = Number(fullmove) || 1;
		let white = side === 'w';
		return line.solutionSans.map((san, i) => {
			const label = white ? `${number}.` : i === 0 ? `${number}…` : '';
			if (!white) number++;
			white = !white;
			return { number: label, san, by: i % 2 === 0 ? 'you' : 'reply' };
		});
	});
}
