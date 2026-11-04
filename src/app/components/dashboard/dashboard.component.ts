import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BY_PRIORITY, levelOf } from '../../feature/dashboard/priority';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeProgressService } from '../../feature/practice/practice-progress.service';
import { scoreTotal } from '../../feature/practice/practice-score';
import { TOTAL_POINTS } from '../../feature/practice/practice.data';
import { ReadingProgressService } from '../../feature/reading/reading-progress.service';
import { SystemsService } from '../../feature/systems/systems.service';
import { loadTemplates, SystemTemplate } from '../../feature/systems/systems.templates';
import { pick, THEORY_TOPICS } from '../../feature/theory/theory.data';

/** Results under this many points are suggested again. */
const RETRY_BELOW = 26;
const SHOWN = 4;

/**
 * The home page of someone who is signed in: what to read next by importance, which exercises to do for the
 * lessons already read, and a template to build a system from.
 */
@Component({
	selector: 'app-dashboard',
	imports: [RouterLink, TPipe],
	templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
	private readonly _reading = inject(ReadingProgressService);
	private readonly _practice = inject(PracticeProgressService);
	private readonly _systems = inject(SystemsService);
	private readonly _router = inject(Router);
	private readonly _language = inject(I18nService).language;

	protected readonly pick = pick;
	protected readonly language = this._language;
	protected readonly lessons = THEORY_TOPICS.length;
	protected readonly maxPoints = TOTAL_POINTS;
	protected readonly templates = signal<SystemTemplate[]>([]);
	protected readonly starting = signal(false);

	protected readonly readCount = computed(() => this._reading.read().size);
	protected readonly practicedCount = computed(() => Object.keys(this._practice.scores()).length);
	protected readonly points = computed(() => Object.values(this._practice.scores()).reduce((sum, score) => sum + scoreTotal(score), 0));

	/** The lessons not read yet, the most important first. */
	protected readonly readNext = computed(() =>
		BY_PRIORITY.filter((card) => !this._reading.isRead(card.slug))
			.slice(0, SHOWN)
			.map((card) => ({ ...card, level: levelOf(card) })),
	);

	/** Exercises of lessons that were read and not practiced yet, then those practiced with a low result. */
	protected readonly practiceNext = computed(() => {
		const scores = this._practice.scores();
		const fresh = BY_PRIORITY.filter((card) => this._reading.isRead(card.slug) && !scores[card.slug]).map((card) => ({ ...card, best: null as number | null }));
		const retry = BY_PRIORITY.filter((card) => scores[card.slug] && scoreTotal(scores[card.slug]) < RETRY_BELOW).map((card) => ({
			...card,
			best: scoreTotal(scores[card.slug]),
		}));
		return [...fresh, ...retry].slice(0, SHOWN);
	});

	/**
	 * A template to build: of those the user has not built yet, the one whose lessons are read the most.
	 * Without any reading it is the first one, the simplest.
	 */
	protected readonly suggestion = computed(() => {
		const built = new Set(this._systems.items().map((item) => item.templateId));
		const byNumber = new Map(THEORY_TOPICS.map((card) => [card.number, card]));
		const options = this.templates()
			.filter((template) => !built.has(template.id))
			.map((template) => {
				const used = [...new Set(template.nodes.flatMap((node) => node.theoryIds))].flatMap((number) => {
					const card = byNumber.get(number);
					return card ? [card] : [];
				});
				const unread = used.filter((card) => !this._reading.isRead(card.slug));
				return { template, total: used.length, read: used.length - unread.length, unread: unread.slice(0, 3) };
			});
		return options.reduce<(typeof options)[number] | null>((best, option) => (!best || option.read > best.read ? option : best), null);
	});

	constructor() {
		void loadTemplates().then((templates) => this.templates.set(templates));
	}

	protected async build(template: SystemTemplate) {
		this.starting.set(true);
		try {
			const system = this._systems.create(pick(template.name, this._language()), template);
			await this._router.navigate(['/system', system.id]);
		} finally {
			this.starting.set(false);
		}
	}
}
