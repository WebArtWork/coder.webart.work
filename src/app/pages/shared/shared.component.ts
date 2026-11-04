import { Component, computed, inject, signal, TemplateRef, ViewEncapsulation, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FCanvasComponent, FFlowModule } from '@foblex/flow';
import { FiltersService, registerPageActions } from '../../feature/filters/filters.service';
import { FitOnResizeDirective } from '../../components/fit-on-resize/fit-on-resize.directive';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { SharedSystem, SharedSystemsService } from '../../feature/systems/shared-systems.service';
import { viewNodes } from '../../feature/systems/system-view';
import { loadTemplates, SystemTemplate } from '../../feature/systems/systems.templates';
import { pick } from '../../feature/theory/theory.data';

/**
 * A system opened from a shared link, /shared/<id>: the canvas to look at and zoom, with nothing to move,
 * connect or remove. It is a copy made when the owner shared it.
 */
@Component({
	imports: [FFlowModule, FitOnResizeDirective, TPipe],
	templateUrl: './shared.component.html',
	// the canvas looks like the editor's: the same styles, so the same file
	styleUrl: '../system/system.component.scss',
	encapsulation: ViewEncapsulation.None,
})
export class SharedComponent {
	private readonly _shared = inject(SharedSystemsService);
	private readonly _language = inject(I18nService).language;
	private readonly _canvas = viewChild(FCanvasComponent);

	private readonly _filters = inject(FiltersService);
	private readonly _about = viewChild<TemplateRef<unknown>>('about');

	protected readonly pick = pick;
	protected readonly language = this._language;
	/** The template the system started from, for the notes about it. */
	protected readonly template = signal<SystemTemplate | null>(null);
	/** Whether the owner wants the notes about the template shown. */
	protected readonly showTemplate = computed(() => this.system()?.showTemplateInfo !== false);
	/** Anything to read: the owner's notes, or the template's notes. */
	private readonly _hasAbout = computed(() => !!this.system()?.notes || (this.showTemplate() && !!this.template()));
	protected readonly system = signal<SharedSystem | null>(null);
	/** `loading`, then `ready` or `missing` (no such system, or the link is wrong). */
	protected readonly state = signal<'loading' | 'ready' | 'missing'>('loading');
	protected readonly nodes = computed(() => viewNodes(this.system(), this._language()));
	protected readonly groups = computed(() => this.system()?.groups ?? []);

	constructor() {
		// the editor's two reading buttons: the notes about the template, and fit to screen
		registerPageActions(
			computed(() => [
				...(this._hasAbout() ? [{ label: 'About this system', icon: 'info' as const, run: () => this._openAbout() }] : []),
				{ label: 'Fit to screen', icon: 'center' as const, run: () => this.fit(), disabled: computed(() => !this.system()?.nodes.length) },
			]),
			true,
		);
		const id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
		this._shared
			.load(id)
			.then((system) => {
				this.system.set(system);
				const templateId = system?.templateId;
				if (templateId) void loadTemplates().then((all) => this.template.set(all.find((item) => item.id === templateId) ?? null));
				this.state.set(system ? 'ready' : 'missing');
			})
			.catch(() => this.state.set('missing'));
	}

	private _openAbout() {
		const template = this._about();
		if (template) this._filters.showTemplate(template, 'About this system');
	}

	protected fit() {
		if (this.system()?.nodes.length) this._canvas()?.fitToScreen({ x: 80, y: 80 }, false, false, 1);
	}
}
