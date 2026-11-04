import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../components/icon/icon.component';
import { SystemShareService } from '../../feature/systems/system-share.service';
import { SystemItem } from '../../feature/systems/systems.model';
import { registerPageActions } from '../../feature/filters/filters.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { LoadingService } from '../../feature/loading/loading.service';
import { SystemsService } from '../../feature/systems/systems.service';
import { loadTemplates, SystemTemplate } from '../../feature/systems/systems.templates';

/** The Systems page: the systems the user builds out of lessons, and a button to start a new one. */
@Component({
	imports: [IconComponent, RouterLink, TPipe],
	templateUrl: './systems.component.html',
})
export class SystemsComponent {
	private readonly _systems = inject(SystemsService);
	private readonly _router = inject(Router);
	private readonly _i18n = inject(I18nService);
	private readonly _loading = inject(LoadingService);
	private readonly _systemShare = inject(SystemShareService);
	private _sharedTimer?: ReturnType<typeof setTimeout>;

	/** The system whose link was just copied, for a moment. */
	protected readonly sharedId = signal<string | null>(null);

	protected readonly items = this._systems.items;
	protected readonly language = this._i18n.language;
	protected readonly locale = computed(() => (this._i18n.language() === 'ua' ? 'uk' : 'en'));
	protected readonly creating = signal(false);
	/** The 12 templates, loaded when the form opens. */
	protected readonly templates = signal<SystemTemplate[]>([]);
	/** The chosen template; none is the default, an empty canvas. */
	protected readonly templateId = signal<string | null>(null);
	/** The system waiting for the "really delete?" answer. */
	protected readonly deleting = signal<string | null>(null);

	constructor() {
		registerPageActions([{ label: 'Create a system', icon: 'plus', run: () => this.startCreating() }]);
	}

	protected startCreating() {
		this.templateId.set(null);
		this.creating.set(true);
		void loadTemplates().then((templates) => this.templates.set(templates));
	}

	protected pickTemplate(template: SystemTemplate | null) {
		this.templateId.set(template?.id ?? null);
	}

	/** The system is named after its template, or "New system" when the canvas starts empty; it can be renamed in the editor. */
	protected async create() {
		await this._loading.track(() => this._createAndOpen());
	}

	private async _createAndOpen() {
		const template = this.templates().find((item) => item.id === this.templateId());
		const name = template ? template.name[this._i18n.language() === 'ua' ? 'ua' : 'en'] : this._i18n.t('New system');
		const system = this._systems.create(name, template);
		await this._router.navigate(['/system', system.id]);
	}

	/** The date a system was last changed, in the language of the page. */
	protected updated(item: SystemItem): string {
		return new Date(item.updatedAt || item.createdAt || Date.now()).toLocaleDateString(this.locale(), { dateStyle: 'medium' });
	}

	/** Shares the read-only link of the system; the long id is made the first time and kept. */
	protected async share(item: SystemItem) {
		if (!(await this._systemShare.share(item))) return;
		this.sharedId.set(item.id);
		clearTimeout(this._sharedTimer);
		this._sharedTimer = setTimeout(() => this.sharedId.set(null), 2000);
	}

	protected remove(id: string) {
		this._systems.remove(id);
		this.deleting.set(null);
	}
}
