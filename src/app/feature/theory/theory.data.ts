import catalogData from '../../../data/theory/catalog.json';
import { TOPIC_LOADERS } from './theory.loaders';

/** A text in each language the lessons are written in. */
export interface Localized {
	en: string;
	ua: string;
}

export interface TheoryModule {
	slug: string;
	title: Localized;
	summary: Localized;
}

/** A lesson's card on the Learn page and its route, /theories/<slug>. */
export interface TheoryCard {
	number: number;
	slug: string;
	module: string;
	minutes: number;
	title: Localized;
	summary: Localized;
}

export interface TheoryTopicBody {
	idea: string[];
	how: string[];
	example: string[];
	tradeoffs: string[];
	brief: string;
	criteria: string[];
	questions: string[];
}

export interface TheoryReading {
	title: string;
	url: string;
}

/** A lesson's text; the reading list is shared by both languages. */
export interface TheoryTopic {
	slug: string;
	en: TheoryTopicBody & { reading: TheoryReading[] };
	ua: TheoryTopicBody;
}

export const THEORY_MODULES = catalogData.modules as TheoryModule[];
export const THEORY_TOPICS = catalogData.topics as TheoryCard[];

export const pick = (text: Localized, language: string | undefined): string =>
	language === 'ua' ? text.ua : text.en;

export async function loadTopic(slug: string): Promise<TheoryTopic> {
	return (await TOPIC_LOADERS[slug]()).default as TheoryTopic;
}
