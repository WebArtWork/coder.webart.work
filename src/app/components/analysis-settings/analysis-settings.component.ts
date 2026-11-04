import { Component, model } from '@angular/core';
import { AnalysisSettings } from '../../feature/chess/chess.interface';
import { TPipe } from '../../feature/i18n/t.pipe';

export const DEFAULT_SETTINGS: AnalysisSettings = {
	depth: 15,
	useMovetime: false,
	movetime: 2000,
	topMoves: 5,
	minCandidates: 3,
};

/** Engine and game limits, shown inside a collapsed disclosure by the pages. */
@Component({
	selector: 'app-analysis-settings',
	imports: [TPipe],
	template: `
		<div class="grid grid-cols-2 gap-4">
			<div class="ds-field !mb-0">
				<label class="ds-label" for="setting-limit">{{ 'Limit search by' | t }}</label>
				<select
					id="setting-limit"
					class="ds-select"
					(change)="set('useMovetime', $any($event.target).value === 'time')"
				>
					<option value="depth" [selected]="!settings().useMovetime">{{ 'Depth' | t }}</option>
					<option value="time" [selected]="settings().useMovetime">{{ 'Time' | t }}</option>
				</select>
			</div>

			@if (settings().useMovetime) {
				<div class="ds-field !mb-0">
					<label class="ds-label" for="setting-time">{{ 'Time per search (ms)' | t }}</label>
					<input
						id="setting-time"
						class="ds-input"
						type="number"
						inputmode="numeric"
						min="500"
						max="30000"
						step="500"
						[value]="settings().movetime"
						(input)="set('movetime', $any($event.target).valueAsNumber)"
					/>
				</div>
			} @else {
				<div class="ds-field !mb-0">
					<label class="ds-label" for="setting-depth">{{ 'Search depth' | t }}</label>
					<input
						id="setting-depth"
						class="ds-input"
						type="number"
						inputmode="numeric"
						min="5"
						max="25"
						[value]="settings().depth"
						(input)="set('depth', $any($event.target).valueAsNumber)"
					/>
				</div>
			}

			<div class="ds-field !mb-0">
				<label class="ds-label" for="setting-top">{{ 'Top moves to find' | t }}</label>
				<input
					id="setting-top"
					class="ds-input"
					type="number"
					inputmode="numeric"
					min="1"
					max="10"
					[value]="settings().topMoves"
					(input)="set('topMoves', $any($event.target).valueAsNumber)"
				/>
			</div>

			<div class="ds-field !mb-0">
				<label class="ds-label" for="setting-min">{{ 'Candidates required' | t }}</label>
				<input
					id="setting-min"
					class="ds-input"
					type="number"
					inputmode="numeric"
					min="1"
					max="10"
					[value]="settings().minCandidates"
					(input)="set('minCandidates', $any($event.target).valueAsNumber)"
				/>
			</div>
		</div>
	`,
})
export class AnalysisSettingsComponent {
	readonly settings = model.required<AnalysisSettings>();

	protected set(key: keyof AnalysisSettings, value: number | boolean) {
		if (typeof value === 'number' && Number.isNaN(value)) return;
		this.settings.update((current) => ({ ...current, [key]: value }));
	}
}
