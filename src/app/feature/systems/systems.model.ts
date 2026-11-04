export interface SystemPoint {
	x: number;
	y: number;
}

/**
 * Something placed on the canvas of a system: a lesson (it has a `slug`), or a component of a template such
 * as "API gateway" (it has a `label`, a `kind` and the lessons that explain it).
 */
export interface SystemNode {
	id: string;
	/** The lesson's slug. */
	slug?: string;
	label?: string;
	kind?: string;
	/** Numbers of the lessons that apply to this component. */
	theoryIds?: number[];
	/** The group the component belongs to. */
	parentId?: string;
	position: SystemPoint;
}

/** A box around components, such as "Clients" or "Data". */
export interface SystemGroup {
	id: string;
	label: string;
	position: SystemPoint;
	size: { width: number; height: number };
}

/** A connection from one item to another: `from` leads to `to`. */
export interface SystemLink {
	id: string;
	from: string;
	to: string;
	label?: string;
	/** How the two talk: sync, event, data and so on. */
	kind?: string;
}

/** A system the user is building out of lessons. */
export interface SystemItem {
	id: string;
	name: string;
	nodes: SystemNode[];
	links: SystemLink[];
	/** Absent in systems saved before templates existed. */
	groups?: SystemGroup[];
	/** The template the system started from; the text about it is read from the template. */
	templateId?: string;
	/** The challenge the system answers; its text is read from the challenge. */
	challengeId?: string;
	/** Numbers of the challenge's checkpoints the learner ticked off. */
	checks?: number[];
	/** The learner's decision record for the challenge. */
	adr?: string;
	/** The owner's text about the system, shown on the shared page. */
	notes?: string;
	/** Whether the shared page also shows the notes about the template; on unless turned off. */
	showTemplateInfo?: boolean;
	/** The long random id of the read-only copy at /shared/<shareId>; set the first time the system is shared. */
	shareId?: string;
	createdAt: number;
	updatedAt: number;
}

/** Where the systems are kept in this browser. */
export const SYSTEMS_STORAGE_KEY = 'coder_systems';

/** The newer copy of each system, so merging two accounts never loses one. */
export function mergeSystems(a: SystemItem[], b: SystemItem[]): SystemItem[] {
	const merged = new Map(a.map((item) => [item.id, item]));
	for (const item of b) {
		const current = merged.get(item.id);
		if (!current || item.updatedAt > current.updatedAt) merged.set(item.id, item);
	}
	return [...merged.values()].sort((x, y) => y.updatedAt - x.updatedAt);
}

export function sameSystems(a: SystemItem[], b: SystemItem[]): boolean {
	return a.length === b.length && a.every((item) => b.find((other) => other.id === item.id)?.updatedAt === item.updatedAt);
}
