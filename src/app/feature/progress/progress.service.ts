import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, PLATFORM_ID, Service, signal, untracked } from '@angular/core';
import type { DocumentReference, Firestore } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { FirebaseService } from '../firebase/firebase.service';
import { MAX_PAWNS, MIN_RATING, PROVISIONAL, rankOf, ratingChange, START_RATING } from './progress.const';

const STORAGE_KEY = 'wawchess_progress';
/** Puzzle practice (then called the quiz) kept its own rating before there was one for every puzzle. */
const LEGACY_QUIZ_KEY = 'wawchess_quiz';

export interface Progress {
	/** Puzzle rating (Elo). */
	rating: number;
	/** Highest rating reached. */
	best: number;
	/** Rated puzzles played. */
	rated: number;
	/** Pawns earned in total; they decide the rank. */
	pawns: number;
}

export interface Completion {
	/**
	 * Earns once: a puzzle id, `daily-<date>`, `la-<id>` (Look Ahead) or `game-<id>`.
	 * Must not contain "/".
	 */
	key: string;
	/** Rated completions: the puzzle's rating and the score, 1 solved, 0 failed, or the share found. */
	rated?: { rating: number; score: number };
	pawns: number;
}

export interface Award {
	/** Rating change; null when not rated. */
	delta: number | null;
	pawns: number;
}

interface LocalProgress extends Progress {
	keys: string[];
}

const FRESH: Progress = { rating: START_RATING, best: START_RATING, rated: 0, pawns: 0 };

/**
 * The puzzle rating and pawns. Signed in, they live on the account (`users/{uid}/progress/current`,
 * one `users/{uid}/events/{key}` per completion; see firestore.rules) and follow the player to
 * every device. Guests keep them in this browser; a new account starts from the guest's numbers.
 */
@Service()
export class ProgressService {
	private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private readonly _auth = inject(AuthService);
	private readonly _firebase = inject(FirebaseService);

	readonly progress = signal<Progress>({ ...FRESH });
	/** True once the account's progress is loaded; false for guests. */
	readonly synced = signal(false);
	readonly rank = computed(() => rankOf(this.progress().pawns));
	readonly provisional = computed(() => this.progress().rated < PROVISIONAL);
	/** The user whose progress is on screen: set once it is loaded (or the load failed). `undefined` before the first load. */
	private readonly _loadedFor = signal<string | null | undefined>(undefined);
	/**
	 * True once the session is restored and the signed-in user's progress is loaded, so the app can show
	 * real numbers instead of the guest's. Always false on the server: the splash screen covers the page
	 * until the browser has the answer.
	 */
	readonly ready = computed(() => {
		const user = this._auth.user();
		return user !== undefined && this._loadedFor() === (user?.uid ?? null);
	});

	private _keys = new Set<string>();
	private _account: { db: Firestore; uid: string; ref: DocumentReference } | null = null;
	/** Account writes, one after another: each one builds on the last. */
	private _writes = Promise.resolve();

	constructor() {
		this._useLocal();
		if (!this._isBrowser) return;
		// keeps a rating carried over from the old puzzle practice storage
		this._saveLocal();
		void this._auth.whenReady();
		effect(() => {
			const uid = this._auth.user()?.uid ?? null;
			untracked(() => void this._switch(uid));
		});
	}

	/** Whether `key` has earned already. */
	has(key: string): boolean {
		return this._keys.has(key);
	}

	/** Records a completion and returns what it earned; null when `key` has earned before. */
	complete(completion: Completion): Award | null {
		if (this._keys.has(completion.key)) return null;
		this._keys.add(completion.key);
		const before = this.progress();
		const pawns = Math.max(0, Math.min(MAX_PAWNS, Math.round(completion.pawns)));
		const rated = completion.rated ?? null;
		const delta = rated ? ratingChange(before.rating, before.rated, rated.rating, rated.score) : 0;
		const rating = Math.max(MIN_RATING, before.rating + delta);
		const after: Progress = {
			rating,
			best: Math.max(before.best, rating),
			rated: before.rated + (rated ? 1 : 0),
			pawns: before.pawns + pawns,
		};
		this.progress.set(after);

		const account = this._account;
		if (account) {
			const event = {
				delta,
				score: rated ? rated.score : null,
				puzzleRating: rated ? Math.round(rated.rating) : null,
				pawns,
			};
			this._writes = this._writes.then(() => this._write(account, completion.key, event, after));
		} else {
			this._saveLocal();
		}
		return { delta: rated ? delta : null, pawns };
	}

	private async _switch(uid: string | null) {
		this._account = null;
		this.synced.set(false);
		this._useLocal();
		try {
			if (!uid) return;
			const db = await this._firebase.firestore();
			if (!db) return;
			const { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } = await import('firebase/firestore');
			const ref = doc(db, 'users', uid, 'progress', 'current');
			let snap = await getDoc(ref);
			if (!snap.exists()) {
				// a new account starts from what was earned as a guest
				const { rating, best, rated, pawns } = this.progress();
				await setDoc(ref, { rating, best, rated, pawns, lastEvent: '', updatedAt: serverTimestamp() });
				snap = await getDoc(ref);
			}
			const events = await getDocs(collection(db, 'users', uid, 'events'));
			if (this._auth.user()?.uid !== uid) return;
			const data = snap.data() as Progress;
			this._keys = new Set(events.docs.map((event) => event.id));
			this.progress.set({ rating: data.rating, best: data.best, rated: data.rated, pawns: data.pawns });
			this._account = { db, uid, ref };
			this.synced.set(true);
		} catch (error) {
			console.error('Could not load the account progress; using this browser instead.', error);
		} finally {
			// a newer sign-in or sign-out has its own load coming
			if ((this._auth.user()?.uid ?? null) === uid) this._loadedFor.set(uid);
		}
	}

	private async _write(
		account: { db: Firestore; uid: string; ref: DocumentReference },
		key: string,
		event: { delta: number; score: number | null; puzzleRating: number | null; pawns: number },
		after: Progress,
	) {
		try {
			const { doc, serverTimestamp, writeBatch } = await import('firebase/firestore');
			const batch = writeBatch(account.db);
			batch.set(doc(account.db, 'users', account.uid, 'events', key), { ...event, createdAt: serverTimestamp() });
			batch.update(account.ref, { ...after, lastEvent: key, updatedAt: serverTimestamp() });
			await batch.commit();
		} catch (error) {
			console.error('Could not save progress to the account.', error);
			// the rules refused it or the write failed: show what the account really holds
			if (this._account === account) void this._switch(account.uid);
		}
	}

	private _useLocal() {
		const local = this._loadLocal();
		this._keys = new Set(local.keys);
		const { keys: _keys, ...progress } = local;
		this.progress.set(progress);
	}

	private _saveLocal() {
		if (!this._isBrowser) return;
		const local: LocalProgress = { ...this.progress(), keys: [...this._keys] };
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
		} catch {
			/* storage unavailable */
		}
	}

	private _loadLocal(): LocalProgress {
		if (!this._isBrowser) return { ...FRESH, keys: [] };
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) return { ...FRESH, keys: [], ...(JSON.parse(raw) as Partial<LocalProgress>) };
			const legacy = localStorage.getItem(LEGACY_QUIZ_KEY);
			if (legacy) {
				const old = JSON.parse(legacy) as { rating?: number; best?: number; played?: number; seen?: string[] };
				return {
					rating: old.rating ?? START_RATING,
					best: old.best ?? old.rating ?? START_RATING,
					rated: old.played ?? 0,
					pawns: 0,
					keys: old.seen ?? [],
				};
			}
		} catch {
			/* storage unavailable or unreadable */
		}
		return { ...FRESH, keys: [] };
	}
}
