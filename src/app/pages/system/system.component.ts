import {
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	signal,
	TemplateRef,
	ViewEncapsulation,
	viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
	FCanvasComponent,
	FCreateConnectionEvent,
	FCreateNodeEvent,
	FFlowModule,
	FMoveNodesEvent,
	FSelectionChangeEvent,
	provideFFlow,
	withA11y,
} from '@foblex/flow';
import {
	Challenge,
	CHALLENGE_TYPES,
	loadChallenge,
} from '../../feature/challenges/challenges.data';
import { FiltersService, registerPageActions } from '../../feature/filters/filters.service';
import { FitOnResizeDirective } from '../../components/fit-on-resize/fit-on-resize.directive';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { viewNodes } from '../../feature/systems/system-view';
import { ShareService } from '../../feature/share/share.service';
import { SystemShareService } from '../../feature/systems/system-share.service';
import { SystemsService } from '../../feature/systems/systems.service';
import { loadTemplates, SystemTemplate } from '../../feature/systems/systems.templates';
import { pick, THEORY_MODULES, THEORY_TOPICS } from '../../feature/theory/theory.data';

/**
 * One system: lessons and template components placed on a Foblex Flow canvas and connected. Lessons are
 * dragged in from the list (or added with a button), moved, connected output to input, selected and removed.
 */
@Component({
	imports: [FFlowModule, FitOnResizeDirective, RouterLink, TPipe],
	providers: [provideFFlow(withA11y())],
	templateUrl: './system.component.html',
	styleUrl: './system.component.scss',
	// the flow's own elements are styled from here, so the styles must not be scoped to this component
	encapsulation: ViewEncapsulation.None,
})
export class SystemComponent {
	private readonly _systems = inject(SystemsService);
	private readonly _router = inject(Router);
	private readonly _id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
	private readonly _language = inject(I18nService).language;
	private readonly _canvas = viewChild(FCanvasComponent);
	private readonly _about = viewChild<TemplateRef<unknown>>('about');
	private readonly _lessons = viewChild<TemplateRef<unknown>>('lessons');
	private readonly _filters = inject(FiltersService);

	protected readonly pick = pick;
	protected readonly language = this._language;
	protected readonly system = computed(() => this._systems.get(this._id));
	protected readonly query = signal('');
	protected readonly selection = signal({
		nodes: [] as string[],
		links: [] as string[],
		groups: [] as string[],
	});
	protected readonly hasSelection = computed(() => {
		const { nodes, links, groups } = this.selection();
		return nodes.length + links.length + groups.length > 0;
	});
	protected readonly template = signal<SystemTemplate | null>(null);
	/** The challenge the system answers, with the checkpoints ticked off so far. */
	protected readonly challenge = signal<Challenge | null>(null);
	protected readonly checks = computed(() => this.system()?.checks ?? []);
	protected readonly typeLabels = CHALLENGE_TYPES;
	protected readonly code = computed(() => (this._language() === 'ua' ? 'ua' : 'en'));

	/** The items on the canvas with their text for the current language. */
	protected readonly nodes = computed(() => viewNodes(this.system(), this._language()));
	protected readonly groups = computed(() => this.system()?.groups ?? []);

	/** The lessons to add, by module, narrowed by the search. */
	protected readonly modules = computed(() => {
		const language = this._language();
		const needle = this.query().trim().toLowerCase();
		return THEORY_MODULES.map((module) => ({
			...module,
			topics: THEORY_TOPICS.filter(
				(topic) =>
					topic.module === module.slug &&
					(!needle || pick(topic.title, language).toLowerCase().includes(needle)),
			),
		})).filter((module) => module.topics.length);
	});

	constructor() {
		// the share button of the top bar shares the read-only link of this system, not the editor's address
		const share = inject(ShareService);
		const systemShare = inject(SystemShareService);
		share.custom.set(() => {
			const item = this.system();
			if (item) void systemShare.share(item);
		});
		inject(DestroyRef).onDestroy(() => share.custom.set(null));
		// the lessons live in a modal, and the canvas tools in the top bar
		registerPageActions(
			computed(() => [
				{ label: 'Add lessons', icon: 'plus' as const, run: () => this._openLessons() },
				{ label: 'About this system', icon: 'info' as const, run: () => this._openAbout() },
				{
					label: 'Remove selected',
					icon: 'trash' as const,
					run: () => this.removeSelected(),
					disabled: computed(() => !this.hasSelection()),
				},
				{
					label: 'Fit to screen',
					icon: 'center' as const,
					run: () => this._fit(),
					disabled: computed(() => !this.system()?.nodes.length),
				},
			]),
			true,
		);
		// a system that does not exist (deleted, or a link from another browser) goes back to the list
		effect(() => {
			if (!this.system()) void this._router.navigateByUrl('/systems', { replaceUrl: true });
		});
		// the notes of the template the system started from
		const templateId = this.system()?.templateId;
		const challengeId = this.system()?.challengeId;
		if (challengeId)
			void loadChallenge(challengeId.toLowerCase()).then((challenge) =>
				this.challenge.set(challenge),
			);
		if (templateId)
			void loadTemplates().then((all) =>
				this.template.set(all.find((item) => item.id === templateId) ?? null),
			);
	}

	protected toggleCheck(index: number) {
		const current = this.checks();
		this._systems.setChallengeWork(this._id, {
			checks: current.includes(index)
				? current.filter((item) => item !== index)
				: [...current, index],
		});
	}

	protected saveNotes(text: string) {
		this._systems.setAbout(this._id, { notes: text });
	}

	protected toggleTemplateInfo(show: boolean) {
		this._systems.setAbout(this._id, { showTemplateInfo: show });
	}

	protected saveAdr(text: string) {
		this._systems.setChallengeWork(this._id, { adr: text });
	}

	protected rename(name: string) {
		this._systems.rename(this._id, name);
	}

	/** A lesson dragged in from the list lands where it was dropped. */
	protected onDrop(event: FCreateNodeEvent<string>) {
		if (!event.data) return;
		const { x, y } = event.externalItemRect;
		this._systems.addNode(this._id, event.data, { x, y });
	}

	/** A lesson added with its button goes to the next free place of a grid, so it never lands on top of another. */
	protected add(slug: string) {
		const count = this.system()?.nodes.length ?? 0;
		this._systems.addNode(this._id, slug, {
			x: 80 + (count % 3) * 360,
			y: 80 + Math.floor(count / 3) * 170,
		});
		this._filters.close();
		queueMicrotask(() => this._fit());
	}

	/** Components and groups moved by the user, a group with the components inside it. */
	protected move(event: FMoveNodesEvent) {
		this._systems.moveItems(this._id, event.nodes);
	}

	protected connect(event: FCreateConnectionEvent) {
		if (!event.targetId) return;
		this._systems.addLink(this._id, _nodeOf(event.sourceId), _nodeOf(event.targetId));
	}

	protected select(event: FSelectionChangeEvent) {
		this.selection.set({
			nodes: event.nodeIds,
			links: event.connectionIds,
			groups: event.groupIds,
		});
	}

	protected removeNode(nodeId: string) {
		this._systems.removeItems(this._id, [nodeId], []);
		this.selection.set({ nodes: [], links: [], groups: [] });
	}

	protected removeSelected() {
		const { nodes, links, groups } = this.selection();
		this._systems.removeItems(this._id, nodes, links, groups);
		this.selection.set({ nodes: [], links: [], groups: [] });
	}

	protected fit() {
		this._fit();
	}

	private _openAbout() {
		const template = this._about();
		if (template) this._filters.showTemplate(template, 'About this system');
	}

	private _openLessons() {
		const template = this._lessons();
		if (template) this._filters.showTemplate(template, 'Lessons');
	}

	private _fit() {
		if (this.system()?.nodes.length)
			this._canvas()?.fitToScreen({ x: 80, y: 80 }, false, false, 1);
	}
}

/** `out-<node>` and `in-<node>` are the connectors of an item. */
const _nodeOf = (connectorId: string): string => connectorId.replace(/^(?:in|out)-/, '');
