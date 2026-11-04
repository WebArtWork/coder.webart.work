import { isPlatformBrowser } from '@angular/common';
import { effect, inject, PLATFORM_ID, Service, signal, untracked } from '@angular/core';
import type { User } from 'firebase/auth';
import { UserDataService } from '../account/user-data.service';
import { AuthService } from '../auth/auth.service';
import { mergeSystems, sameSystems, SystemItem, SystemLink, SystemNode, SystemPoint, SYSTEMS_STORAGE_KEY } from './systems.model';
import { SystemMutations, SystemTemplate } from './systems.templates';

/** The user's systems. Kept in this browser and, for the current user, in Firestore, like the practice results. */
@Service()
export class SystemsService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly _auth = inject(AuthService);
	private readonly _data = inject(UserDataService);
	private _uid: string | null = null;
	private _timer: ReturnType<typeof setTimeout> | undefined;

	readonly items = signal<SystemItem[]>(this._load());

	constructor() {
		effect(() => {
			const user = this._auth.user();
			if (user) untracked(() => void this._adopt(user));
		});
	}

	get(id: string): SystemItem | undefined {
		return this.items().find((item) => item.id === id);
	}

	/**
	 * A new system: empty, or filled with a template, whose items get ids of their own. A challenge can damage
	 * the template's connections first (remove some, add wrong ones) for the learner to repair.
	 */
	create(name: string, template?: SystemTemplate, challenge?: { id: string; mutations?: SystemMutations }): SystemItem {
		const now = Date.now();
		const ids = new Map<string, string>();
		const fresh = (old: string) => ids.get(old) ?? ids.set(old, _id()).get(old)!;
		const remove = new Set(challenge?.mutations?.remove ?? []);
		const connections = [
			...(template?.connections ?? []).filter((link) => !remove.has(`${link.from}->${link.to}`)),
			...(challenge?.mutations?.add ?? []).map((link, index) => ({ ...link, id: `defect-${index}` })),
		];
		const item: SystemItem = {
			id: _id(),
			name: name.trim(),
			nodes: (template?.nodes ?? []).map((node) => ({ ...node, id: fresh(node.id), parentId: fresh(node.parentId) })),
			links: connections.map((link) => ({ ...link, id: _id(), from: fresh(link.from), to: fresh(link.to) })),
			groups: (template?.groups ?? []).map((group) => ({ ...group, id: fresh(group.id) })),
			templateId: template?.id,
			challengeId: challenge?.id,
			createdAt: now,
			updatedAt: now,
		};
		this._set([item, ...this.items()]);
		return item;
	}

	/** The checkpoints ticked off and the decision record of a challenge system. */
	setChallengeWork(id: string, work: { checks?: number[]; adr?: string }) {
		this._update(id, (item) => ({ ...item, ...work }));
	}

	rename(id: string, name: string) {
		this._update(id, (item) => ({ ...item, name: name.trim() || item.name }));
	}

	remove(id: string) {
		this._set(this.items().filter((item) => item.id !== id));
	}

	addNode(id: string, slug: string, position: SystemPoint): SystemNode {
		const node: SystemNode = { id: _id(), slug, position };
		this._update(id, (item) => ({ ...item, nodes: [...item.nodes, node] }));
		return node;
	}

	/** Moves components and groups; a group dragged on the canvas brings its components along. */
	moveItems(id: string, moves: { id: string; position: SystemPoint }[]) {
		const to = new Map(moves.map((move) => [move.id, move.position]));
		this._update(id, (item) => ({
			...item,
			nodes: item.nodes.map((node) => ({ ...node, position: to.get(node.id) ?? node.position })),
			groups: item.groups?.map((group) => ({ ...group, position: to.get(group.id) ?? group.position })),
		}));
	}

	/** Removes components with their connections, groups (their components stay), and connections on their own. */
	removeItems(id: string, nodeIds: string[], linkIds: string[], groupIds: string[] = []) {
		this._update(id, (item) => ({
			...item,
			nodes: item.nodes.filter((node) => !nodeIds.includes(node.id)).map((node) => (node.parentId && groupIds.includes(node.parentId) ? { ...node, parentId: undefined } : node)),
			links: item.links.filter((link) => !linkIds.includes(link.id) && !nodeIds.includes(link.from) && !nodeIds.includes(link.to)),
			groups: item.groups?.filter((group) => !groupIds.includes(group.id)),
		}));
	}

	/** A lesson cannot lead to itself, and the same connection is made once. */
	addLink(id: string, from: string, to: string): SystemLink | null {
		const item = this.get(id);
		if (!item || from === to || item.links.some((link) => link.from === from && link.to === to)) return null;
		const link: SystemLink = { id: _id(), from, to };
		this._update(id, (current) => ({ ...current, links: [...current.links, link] }));
		return link;
	}

	private _update(id: string, change: (item: SystemItem) => SystemItem) {
		this._set(this.items().map((item) => (item.id === id ? { ...change(item), updatedAt: Date.now() } : item)));
	}

	/** Saves here at once and to Firestore a moment later, so a drag does not write on every step. */
	private _set(items: SystemItem[]) {
		this._setLocal(items);
		if (!this._uid) return;
		clearTimeout(this._timer);
		const uid = this._uid;
		this._timer = setTimeout(() => void this._data.saveSystems(uid, this.items()), 600);
	}

	/** A user arrived; as with the practice results, a new guest starts empty and anything else adds up. */
	private async _adopt(user: User) {
		const previous = this._uid;
		this._uid = user.uid;
		if (previous === user.uid) return;
		if (previous && user.isAnonymous) this._setLocal([]);

		const remote = await this._data.loadSystems(user.uid);
		const merged = mergeSystems(this.items(), remote);
		this._setLocal(merged);
		if (!sameSystems(merged, remote)) await this._data.saveSystems(user.uid, merged);
	}

	private _setLocal(items: SystemItem[]) {
		this.items.set(items);
		if (!this._isBrowser) return;
		try {
			localStorage.setItem(SYSTEMS_STORAGE_KEY, JSON.stringify(items));
		} catch {
			// storage full or blocked: the systems last for this visit only
		}
	}

	private _load(): SystemItem[] {
		if (!this._isBrowser) return [];
		try {
			const raw = localStorage.getItem(SYSTEMS_STORAGE_KEY);
			return raw ? (JSON.parse(raw) as SystemItem[]) : [];
		} catch {
			return [];
		}
	}
}

const _id = (): string => crypto.randomUUID();
