import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal, TemplateRef, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CHALLENGE_TEMPLATES, CHALLENGE_TYPES, CHALLENGES } from '../../feature/challenges/challenges.data';
import { registerPageFilters } from '../../feature/filters/filters.service';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { PracticeProgressService } from '../../feature/practice/practice-progress.service';
import { TOTAL_POINTS } from '../../feature/practice/practice.data';
import { SystemsService } from '../../feature/systems/systems.service';
import { pick, THEORY_MODULES, THEORY_TOPICS } from '../../feature/theory/theory.data';

/**
 * The Practice page: the 15 exercises of every lesson with the best result so far, then the system design
 * challenges by template, in one searchable list.
 */
@Component({
	imports: [NgTemplateOutlet, RouterLink, TPipe],
	templateUrl: './practice.component.html',
})
export class PracticeComponent {
	private readonly _language = inject(I18nService).language;
	private readonly _progress = inject(PracticeProgressService);
	private readonly _systems = inject(SystemsService);

	/** The one lesson module or template whose practices are on screen; none at first, which keeps the page light. */
	protected readonly openKey = signal<string | null>(null);

	/** A search shows every match, so it opens all the groups that have one. */
	protected isOpen(key: string): boolean {
		return !!this.query().trim() || this.openKey() === key;
	}

	/** Opens the group, closing the one that was open; a click on the open group closes it. */
	protected toggle(key: string) {
		this.openKey.update((open) => (open === key ? null : key));
	}

	private readonly _filters = viewChild<TemplateRef<unknown>>('filters');
	protected readonly query = signal('');
	/** Every lesson's exercises and every system design challenge, together. */
	protected readonly total = THEORY_TOPICS.length + CHALLENGES.length;
	protected readonly challengeCount = CHALLENGES.length;
	protected readonly maxPoints = TOTAL_POINTS;
	protected readonly pick = pick;
	protected readonly language = this._language;
	protected readonly typeLabels = CHALLENGE_TYPES;

	protected readonly modules = computed(() => {
		const language = this._language();
		const needle = this.query().trim().toLowerCase();
		const scores = this._progress.scores();
		return THEORY_MODULES.map((module) => ({
			...module,
			topics: THEORY_TOPICS.filter(
				(topic) => topic.module === module.slug && (!needle || pick(topic.title, language).toLowerCase().includes(needle)),
			).map((topic) => ({ ...topic, score: scores[topic.slug] })),
		})).filter((module) => module.topics.length);
	});

	/** The challenges by template, each with whether a system was started for it. */
	protected readonly templates = computed(() => {
		const language = this._language();
		const needle = this.query().trim().toLowerCase();
		const started = new Set(this._systems.items().map((item) => item.challengeId));
		return CHALLENGE_TEMPLATES.map((template) => ({
			...template,
			challenges: CHALLENGES.filter(
				(card) =>
					(card.templateId ?? this._emptyHome(card.id)) === template.id &&
					(!needle || pick(card.title, language).toLowerCase().includes(needle)),
			).map((card) => ({ ...card, started: started.has(card.id) })),
		})).filter((template) => template.challenges.length);
	});

	protected readonly shown = computed(
		() => this.modules().reduce((sum, module) => sum + module.topics.length, 0) + this.templates().reduce((sum, template) => sum + template.challenges.length, 0),
	);

	constructor() {
		// on a phone the search is in the top bar
		registerPageFilters(this._filters, computed(() => !!this.query()));
	}

	/** A Build challenge starts empty, so it belongs to the template whose number it carries: SYS-03-BUILD to the third. */
	private _emptyHome(id: string): string {
		return CHALLENGE_TEMPLATES[Number(id.split('-')[1]) - 1]?.id ?? '';
	}
}
