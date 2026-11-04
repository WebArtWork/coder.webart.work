import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HubItem } from '../../feature/hub/hub.interface';
import { TPipe } from '../../feature/i18n/t.pipe';
import { IconComponent } from '../icon/icon.component';

/** The rows (or paired cards) of a hub page: what each mode is, an optional status, and a link into it. */
@Component({
	selector: 'app-hub-list',
	imports: [IconComponent, RouterLink, TPipe],
	template: `
		<ul
			[class]="
				paired()
					? 'grid grid-cols-1 gap-2 sm:grid-cols-2'
					: 'divide-y divide-line overflow-hidden rounded-xl border border-line bg-card'
			"
		>
			@for (item of items(); track item.path; let last = $last; let odd = $odd) {
				<li [class]="paired() ? 'overflow-hidden rounded-xl border border-line bg-card' + (last && !odd ? ' sm:col-span-2' : '') : ''">
					<a class="flex items-center gap-4 px-4 py-3.5 text-fg! no-underline hover:bg-soft" [routerLink]="item.path" [queryParams]="item.query">
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-x-2 gap-y-1">
								<span class="font-semibold leading-snug">{{ item.title | t }}</span>
								@if (status()[item.path]; as text) {
									<span class="ds-badge">{{ text | t }}</span>
								}
							</span>
							<span class="block text-sm leading-snug text-mute">{{ item.detail | t }}</span>
						</span>
						<app-icon class="shrink-0 text-mute" name="next" />
					</a>
				</li>
			}
		</ul>
	`,
})
export class HubListComponent {
	readonly items = input.required<HubItem[]>();
	/** Cards two to a row on wider screens, for related modes side by side; a last odd one spans the row. */
	readonly paired = input(false);
	/** Short status per item path, e.g. "Solved"; items without one show none. */
	readonly status = input<Record<string, string | null>>({});
}
