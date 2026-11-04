import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { SystemsService } from '../../feature/systems/systems.service';
import { loadTemplates, SystemTemplate } from '../../feature/systems/systems.templates';

/** The Systems page: the systems the user builds out of lessons, and a button to start a new one. */
@Component({
	imports: [DatePipe, RouterLink, TPipe],
	templateUrl: './systems.component.html',
})
export class SystemsComponent {
	private readonly _systems = inject(SystemsService);
	private readonly _router = inject(Router);
	private readonly _i18n = inject(I18nService);

	protected readonly items = this._systems.items;
	protected readonly language = this._i18n.language;
	protected readonly locale = computed(() => (this._i18n.language() === 'ua' ? 'uk' : 'en'));
	protected readonly creating = signal(false);
	protected readonly name = signal('');
	/** The 12 templates, loaded when the form opens. */
	protected readonly templates = signal<SystemTemplate[]>([]);
	/** The chosen template; none is the default, an empty canvas. */
	protected readonly templateId = signal<string | null>(null);
	/** The system waiting for the "really delete?" answer. */
	protected readonly deleting = signal<string | null>(null);

	protected startCreating() {
		this.name.set('');
		this.templateId.set(null);
		this.creating.set(true);
		void loadTemplates().then((templates) => this.templates.set(templates));
	}

	/** Picks a template, or none; a name still empty becomes the template's name. */
	protected pickTemplate(template: SystemTemplate | null) {
		this.templateId.set(template?.id ?? null);
		if (template && !this.name().trim()) this.name.set(template.name[this._i18n.language() === 'ua' ? 'ua' : 'en']);
	}

	protected create() {
		const name = this.name().trim();
		if (!name) return;
		const template = this.templates().find((item) => item.id === this.templateId());
		const system = this._systems.create(name, template);
		void this._router.navigate(['/systems', system.id]);
	}

	protected remove(id: string) {
		this._systems.remove(id);
		this.deleting.set(null);
	}
}
