import { pick, THEORY_MODULES, THEORY_TOPICS } from '../theory/theory.data';
import { SystemItem, SystemNode } from './systems.model';

export interface ViewNode extends SystemNode {
	title: string;
	module: string;
	lessons: { slug: string; number: number; title: string }[];
}

const CARDS = new Map(THEORY_TOPICS.map((topic) => [topic.slug, topic]));
const NUMBERS = new Map(THEORY_TOPICS.map((topic) => [topic.number, topic]));
const MODULES = new Map(THEORY_MODULES.map((module) => [module.slug, module]));

/** The items of a system with their text for a language; a component lists the lessons that explain it. */
export function viewNodes(system: Pick<SystemItem, 'nodes'> | null | undefined, language: string): ViewNode[] {
	return (system?.nodes ?? []).flatMap((node): ViewNode[] => {
		if (node.slug) {
			const card = CARDS.get(node.slug);
			const module = card && MODULES.get(card.module);
			return card && module ? [{ ...node, title: pick(card.title, language), module: pick(module.title, language), lessons: [] }] : [];
		}
		const lessons = (node.theoryIds ?? []).flatMap((number) => {
			const card = NUMBERS.get(number);
			return card ? [{ slug: card.slug, number, title: pick(card.title, language) }] : [];
		});
		return [{ ...node, title: node.label ?? '', module: node.kind ?? '', lessons }];
	});
}
