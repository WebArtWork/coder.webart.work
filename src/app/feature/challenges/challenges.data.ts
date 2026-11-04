import indexData from '../../../data/challenges/index.json';
import { THEORY_TOPICS } from '../theory/theory.data';
import { CHALLENGE_LOADERS } from './challenges.loaders';

interface Localized {
	en: string;
	ua: string;
}

export type ChallengeType = 'build' | 'fix' | 'extend' | 'optimize' | 'review';

/** A challenge in a list; the text is loaded with the challenge itself. */
export interface ChallengeCard {
	id: string;
	/** The id in lower case: the route is /practices/challenge/<slug>. */
	slug: string;
	/** The template the challenge starts from; none means an empty canvas. */
	templateId: string | null;
	type: ChallengeType;
	level: Localized;
	minutes: number;
	title: Localized;
	/** Numbers of the lessons it applies. */
	theoryIds: number[];
}

export interface ChallengeBody {
	scenario: Localized;
	tasks: { en: string[]; ua: string[] };
	/** What to check in your own answer. */
	checks: Localized[];
	/** A Fix challenge starts from a damaged copy of the template. */
	mutations?: {
		remove: string[];
		add: { from: string; to: string; kind: string; label: string }[];
	};
}

export interface Challenge extends ChallengeCard, ChallengeBody {}

export const CHALLENGE_TEMPLATES = indexData.templates as { id: string; name: Localized }[];
export const CHALLENGES = indexData.challenges as ChallengeCard[];

export const CHALLENGE_TYPES: Record<ChallengeType, string> = {
	build: 'Build',
	fix: 'Fix',
	extend: 'Extend',
	optimize: 'Optimize',
	review: 'Review',
};

/** What the learner does in each type, shown with the type. */
export const CHALLENGE_TYPE_DETAILS: Record<ChallengeType, string> = {
	build: 'Start from an empty canvas and draw the architecture.',
	fix: 'Start from a damaged copy of a template and repair it.',
	extend: 'Start from a template and add a capability.',
	optimize: 'Start from a template and improve it, measurably.',
	review: 'Start from a template and recommend a decision.',
};

export async function loadChallenge(slug: string): Promise<Challenge> {
	const card = CHALLENGES.find((item) => item.slug === slug)!;
	const body = (await CHALLENGE_LOADERS[slug]()).default as ChallengeBody;
	return { ...card, ...body };
}

const _byNumber = new Map(THEORY_TOPICS.map((topic) => [topic.number, topic]));

/** The lessons a challenge applies, in the order of their numbers. */
export function lessonsOf(card: ChallengeCard) {
	return card.theoryIds.flatMap((number) => {
		const topic = _byNumber.get(number);
		return topic ? [topic] : [];
	});
}

/** The challenges that apply a lesson. */
export function challengesOf(lessonNumber: number): ChallengeCard[] {
	return CHALLENGES.filter((card) => card.theoryIds.includes(lessonNumber));
}
