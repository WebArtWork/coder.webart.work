import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LinkedTextComponent } from '../../components/linked-text/linked-text.component';
import {
	CHALLENGE_TEMPLATES,
	CHALLENGE_TYPE_DETAILS,
	CHALLENGE_TYPES,
	CHALLENGES,
	Challenge,
	lessonsOf,
} from '../../feature/challenges/challenges.data';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { SystemsService } from '../../feature/systems/systems.service';
import { loadTemplates } from '../../feature/systems/systems.templates';
import { pick } from '../../feature/theory/theory.data';

/**
 * One system design challenge, loaded by the route (`challenge`): the scenario, the tasks and what to check,
 * the lessons it applies, and a button that opens a system in the editor, set up for the challenge.
 */
@Component({
	imports: [LinkedTextComponent, RouterLink, TPipe],
	templateUrl: './challenge.component.html',
})
export class ChallengeComponent {
	private readonly _systems = inject(SystemsService);
	private readonly _router = inject(Router);
	private readonly _language = inject(I18nService).language;

	protected readonly challenge = inject(ActivatedRoute).snapshot.data['challenge'] as Challenge;
	protected readonly pick = pick;
	protected readonly language = this._language;
	protected readonly typeLabel = CHALLENGE_TYPES[this.challenge.type];
	protected readonly typeDetail = CHALLENGE_TYPE_DETAILS[this.challenge.type];
	protected readonly template = CHALLENGE_TEMPLATES.find((item) => item.id === this.challenge.templateId);
	protected readonly lessons = lessonsOf(this.challenge);
	protected readonly previous = CHALLENGES[CHALLENGES.findIndex((card) => card.id === this.challenge.id) - 1];
	protected readonly next = CHALLENGES[CHALLENGES.findIndex((card) => card.id === this.challenge.id) + 1];
	protected readonly starting = signal(false);

	protected readonly language2 = computed(() => (this._language() === 'ua' ? 'ua' : 'en'));
	/** The systems already started for this challenge. */
	protected readonly started = computed(() => this._systems.items().filter((item) => item.challengeId === this.challenge.id));

	/** Opens a new system in the editor: empty, or a copy of the template, damaged for a Fix challenge. */
	protected async start() {
		this.starting.set(true);
		try {
			const template = this.challenge.templateId
				? (await loadTemplates()).find((item) => item.id === this.challenge.templateId)
				: undefined;
			const system = this._systems.create(pick(this.challenge.title, this._language()), template, {
				id: this.challenge.id,
				mutations: this.challenge.mutations,
			});
			await this._router.navigate(['/system', system.id]);
		} finally {
			this.starting.set(false);
		}
	}
}
