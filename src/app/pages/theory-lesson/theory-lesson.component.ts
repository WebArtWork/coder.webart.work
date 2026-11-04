import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LinkedTextComponent } from '../../components/linked-text/linked-text.component';
import { I18nService } from '../../feature/i18n/i18n.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { challengesOf, CHALLENGE_TYPES } from '../../feature/challenges/challenges.data';
import { ReadingProgressService } from '../../feature/reading/reading-progress.service';
import { PracticeProgressService } from '../../feature/practice/practice-progress.service';
import { TOTAL_POINTS } from '../../feature/practice/practice.data';
import { pick, THEORY_MODULES, THEORY_TOPICS, TheoryTopic } from '../../feature/theory/theory.data';

/** One lesson, loaded by the route (`topic`) so the prerendered page already holds its text. */
@Component({
	imports: [LinkedTextComponent, RouterLink, TPipe],
	templateUrl: './theory-lesson.component.html',
})
export class TheoryLessonComponent {
	private readonly _route = inject(ActivatedRoute).snapshot;
	private readonly _language = inject(I18nService).language;

	private readonly _progress = inject(PracticeProgressService);
	private readonly _reading = inject(ReadingProgressService);
	protected readonly isRead = computed(() => this._reading.isRead(this.topic.slug));
	protected readonly markedRead = computed(() => this._reading.marked().includes(this.topic.slug));
	protected readonly maxPoints = TOTAL_POINTS;
	protected readonly typeLabels = CHALLENGE_TYPES;
	protected readonly pick = pick;

	protected toggleRead() {
		this._reading.toggle(this.topic.slug);
	}

	protected readonly language = this._language;
	protected readonly topic = this._route.data['topic'] as TheoryTopic;
	protected readonly index = THEORY_TOPICS.findIndex((card) => card.slug === this.topic.slug);
	protected readonly card = THEORY_TOPICS[this.index];
	protected readonly module = THEORY_MODULES.find((module) => module.slug === this.card.module)!;
	protected readonly previous = THEORY_TOPICS[this.index - 1];
	protected readonly next = THEORY_TOPICS[this.index + 1];
	protected readonly body = computed(() => (this._language() === 'ua' ? this.topic.ua : this.topic.en));
	protected readonly reading = this.topic.en.reading;
	/** The system design challenges that apply this lesson. */
	protected readonly challenges = challengesOf(this.card.number);
	protected readonly score = computed(() => this._progress.scores()[this.topic.slug]);
}
