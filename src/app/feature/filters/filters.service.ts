import { DestroyRef, effect, inject, Service, signal, Signal, TemplateRef } from '@angular/core';
import { ModalService } from '@wawjs/ngx-ui';
import { FiltersModalComponent } from '../../components/filters-modal/filters-modal.component';

/** The filters of the page on screen: their template, and whether any of them is switched on. */
interface PageFilters {
	/** Tells apart a page from the one that replaced it, so a page being left never clears the new page's filters. */
	owner: object;
	template: TemplateRef<unknown>;
	active: Signal<boolean>;
}

/**
 * The filters of a page. On a phone they leave the page for a button in the top bar, which opens them in a
 * modal; the page keeps one template of its filters and shows it inline on larger screens.
 */
@Service()
export class FiltersService {
	private readonly _modal = inject(ModalService);
	private _open: { close?: () => void } | null = null;

	/** Set while the page on screen has filters. */
	readonly page = signal<PageFilters | null>(null);

	open() {
		const page = this.page();
		if (!page || this._open) return;
		this._open = this._modal.show({
			component: FiltersModalComponent,
			size: 'small',
			template: page.template,
			ariaLabelledBy: 'filters-title',
			onClose: () => (this._open = null),
		});
	}

	close() {
		this._open?.close?.();
	}
}

/**
 * Called from a page's constructor: hands the template of its filters (a `viewChild` of an `<ng-template>`)
 * to the top bar. The registration ends with the page.
 */
export function registerPageFilters(template: Signal<TemplateRef<unknown> | undefined>, active: Signal<boolean>) {
	const filters = inject(FiltersService);
	const owner = {};
	effect(() => {
		const ref = template();
		if (ref) filters.page.set({ owner, template: ref, active });
	});
	inject(DestroyRef).onDestroy(() => {
		if (filters.page()?.owner === owner) filters.page.set(null);
		filters.close();
	});
}
