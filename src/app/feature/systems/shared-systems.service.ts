import { inject, Service } from '@angular/core';
import { FirebaseService } from '../firebase/firebase.service';
import { SystemItem } from './systems.model';

/** What a read-only link shows: the system as it was when it was shared. */
export type SharedSystem = Pick<SystemItem, 'name' | 'nodes' | 'links' | 'groups' | 'templateId' | 'notes'> & { showTemplateInfo: boolean };

/**
 * Read-only copies of systems, at `shared/{shareId}` in Firestore (see firestore.rules). The id is long and
 * random, so a link can be opened by whoever has it and cannot be guessed.
 */
@Service()
export class SharedSystemsService {
	private readonly _firebase = inject(FirebaseService);

	/** A new id: 32 random bytes, 43 characters. */
	newId(): string {
		const bytes = crypto.getRandomValues(new Uint8Array(32));
		return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	}

	/** Saves (or refreshes) the read-only copy of a system; `uid` is its owner, the only one who can change it later. */
	async publish(shareId: string, uid: string, item: SystemItem): Promise<void> {
		const db = await this._firebase.firestore();
		if (!db) throw new Error('Sharing is only available in the browser.');
		const { doc, serverTimestamp, setDoc } = await import('firebase/firestore');
		await setDoc(doc(db, 'shared', shareId), {
			ownerUid: uid,
			name: item.name,
			nodes: item.nodes,
			links: item.links,
			groups: item.groups ?? [],
			templateId: item.templateId ?? '',
			notes: item.notes ?? '',
			showTemplateInfo: item.showTemplateInfo ?? true,
			updatedAt: serverTimestamp(),
		});
	}

	/** The shared system, or null when there is none under this id. */
	async load(shareId: string): Promise<SharedSystem | null> {
		const db = await this._firebase.firestore();
		if (!db) return null;
		const { doc, getDoc } = await import('firebase/firestore');
		const data = (await getDoc(doc(db, 'shared', shareId))).data();
		if (!data) return null;
		return {
			name: String(data['name'] ?? ''),
			nodes: data['nodes'] ?? [],
			links: data['links'] ?? [],
			groups: data['groups'] ?? [],
			templateId: data['templateId'] || undefined,
			notes: String(data['notes'] ?? ''),
			showTemplateInfo: data['showTemplateInfo'] !== false,
		};
	}
}
