import { SystemGroup, SystemLink, SystemNode } from './systems.model';

interface Localized {
	en: string;
	ua: string;
}

/** A starting point for a system: a reference architecture. The default is no template, an empty canvas. */
export interface SystemTemplate {
	id: string;
	name: Localized;
	purpose: string;
	groups: SystemGroup[];
	nodes: Required<Pick<SystemNode, 'id' | 'label' | 'kind' | 'position' | 'parentId' | 'theoryIds'>>[];
	connections: (Required<Pick<SystemLink, 'id' | 'from' | 'to' | 'label' | 'kind'>>)[];
	/** Choices the template makes, and questions to ask about them; in English. */
	decisions: string[];
	questions: string[];
}

/** Connections a challenge removes (as `from->to`) and adds, to hand the learner a damaged template. */
export interface SystemMutations {
	remove: string[];
	add: { from: string; to: string; kind: string; label: string }[];
}

let _loading: Promise<SystemTemplate[]> | null = null;

/** The 12 templates, loaded when they are first needed. */
export function loadTemplates(): Promise<SystemTemplate[]> {
	_loading ??= import('../../../data/systems/templates.json').then((module) => module.default as SystemTemplate[]);
	return _loading;
}
