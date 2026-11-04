import { Component, computed, effect, HostListener, inject, signal, ViewEncapsulation, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FCanvasComponent, FCreateConnectionEvent, FCreateNodeEvent, FFlowModule, FMoveNodesEvent, FSelectionChangeEvent } from '@foblex/flow';
import { Challenge, CHALLENGE_TYPES, loadChallenge } from '../../feature/challenges/challenges.data';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { SystemsService } from '../../feature/systems/systems.service';
import { loadTemplates, SystemTemplate } from '../../feature/systems/systems.templates';
import { pick, THEORY_MODULES, THEORY_TOPICS } from '../../feature/theory/theory.data';

/**
 * One system: lessons and template components placed on a Foblex Flow canvas and connected. Lessons are
 * dragged in from the list (or added with a button), moved, connected output to input, selected and removed.
 */
@Component({
	imports: [FFlowModule, RouterLink, TPipe],
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

	protected readonly pick = pick;
	protected readonly language = this._language;
	protected readonly system = computed(() => this._systems.get(this._id));
	protected readonly query = signal('');
	protected readonly selection = signal({ nodes: [] as string[], links: [] as string[], groups: [] as string[] });
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

	private readonly _cards = new Map(THEORY_TOPICS.map((topic) => [topic.slug, topic]));
	private readonly _numbers = new Map(THEORY_TOPICS.map((topic) => [topic.number, topic]));
	private readonly _modules = new Map(THEORY_MODULES.map((module) => [module.slug, module]));

	/** The items on the canvas with their text for the current language; a component lists the lessons that explain it. */
	protected readonly nodes = computed(() =>
		(this.system()?.nodes ?? []).flatMap((node) => {
			const language = this._language();
			if (node.slug) {
				const card = this._cards.get(node.slug);
				const module = card && this._modules.get(card.module);
				return card && module
					? [{ ...node, title: pick(card.title, language), module: pick(module.title, language), lessons: [] as { slug: string; number: number; title: string }[] }]
					: [];
			}
			const lessons = (node.theoryIds ?? []).flatMap((number) => {
				const card = this._numbers.get(number);
				return card ? [{ slug: card.slug, number, title: pick(card.title, language) }] : [];
			});
			return [{ ...node, title: node.label ?? '', module: node.kind ?? '', lessons }];
		}),
	);
	protected readonly groups = computed(() => this.system()?.groups ?? []);

	/** The lessons to add, by module, narrowed by the search. */
	protected readonly modules = computed(() => {
		const language = this._language();
		const needle = this.query().trim().toLowerCase();
		return THEORY_MODULES.map((module) => ({
			...module,
			topics: THEORY_TOPICS.filter(
				(topic) => topic.module === module.slug && (!needle || pick(topic.title, language).toLowerCase().includes(needle)),
			),
		})).filter((module) => module.topics.length);
	});

	constructor() {
		// a system that does not exist (deleted, or a link from another browser) goes back to the list
		effect(() => {
			if (!this.system()) void this._router.navigateByUrl('/systems', { replaceUrl: true });
		});
		// the notes of the template the system started from
		const templateId = this.system()?.templateId;
		const challengeId = this.system()?.challengeId;
		if (challengeId) void loadChallenge(challengeId.toLowerCase()).then((challenge) => this.challenge.set(challenge));
		if (templateId) void loadTemplates().then((all) => this.template.set(all.find((item) => item.id === templateId) ?? null));
	}

	protected toggleCheck(index: number) {
		const current = this.checks();
		this._systems.setChallengeWork(this._id, { checks: current.includes(index) ? current.filter((item) => item !== index) : [...current, index] });
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
		this._systems.addNode(this._id, slug, { x: 80 + (count % 3) * 360, y: 80 + Math.floor(count / 3) * 170 });
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
		this.selection.set({ nodes: event.nodeIds, links: event.connectionIds, groups: event.groupIds });
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

	/** Delete or Backspace removes what is selected, unless the user is typing. */
	@HostListener('document:keydown', ['$event'])
	protected onKey(event: KeyboardEvent) {
		if (event.key !== 'Delete' && event.key !== 'Backspace') return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, [contenteditable]') || !this.hasSelection()) return;
		event.preventDefault();
		this.removeSelected();
	}

	protected fit() {
		this._fit();
	}

	private _fit() {
		if (this.system()?.nodes.length) this._canvas()?.fitToScreen({ x: 80, y: 80 }, false, false, 1);
	}
}

/** `out-<node>` and `in-<node>` are the connectors of an item. */
const _nodeOf = (connectorId: string): string => connectorId.replace(/^(?:in|out)-/, '');
