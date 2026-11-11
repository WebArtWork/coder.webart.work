import { computed, inject, Service, signal } from '@angular/core';
import type { Auth, AuthCredential, User } from 'firebase/auth';
import { AccountService } from '../account/account.service';
import { UserDataService } from '../account/user-data.service';
import { FirebaseService } from '../firebase/firebase.service';
import { PRACTICE_STORAGE_KEY } from '../practice/practice-score';
import { READING_STORAGE_KEY } from '../reading/reading.model';
import { SYSTEMS_STORAGE_KEY } from '../systems/systems.model';

/** Bundle id of the native app; Sign in with Apple on the device is authorized for it. */
const APP_ID = 'work.webart.coder';
/** Where Apple returns after the web sign-in; the same Return URL is set in the Apple Services ID. */
const APPLE_REDIRECT_URI = 'https://coder-50e2e.firebaseapp.com/__/auth/handler';

/** What differs between the providers: how a guest links, how a user signs in, and where the credential is in an error. */
interface SignInFlow {
	link(guest: User): Promise<User>;
	signIn(): Promise<User>;
	credentialFromError(error: unknown): AuthCredential | null;
}

/**
 * Firebase Auth. Everyone is signed in as a guest (an anonymous user) from the first visit, so progress is
 * saved from the start. Signing in with Google or Apple then turns the guest into that account.
 */
@Service()
export class AuthService {
	private readonly _firebase = inject(FirebaseService);
	private readonly _account = inject(AccountService);
	private readonly _data = inject(UserDataService);

	/**
	 * `undefined` until Firebase restores the session; `null` only when even a guest could not be signed in.
	 * The Firebase user is updated in place when a guest links a provider, so every set counts as a change.
	 */
	readonly user = signal<User | null | undefined>(undefined, { equal: () => false });
	/** A guest: signed in, but not with Google or Apple yet. */
	readonly isGuest = computed(() => this.user()?.isAnonymous === true);

	private _ready: Promise<void> | null = null;

	/** Resolves with the current user once Firebase has checked the saved session, or created a guest. */
	async whenReady(): Promise<User | null> {
		this._ready ??= this._restore();
		await this._ready;
		return this.user() ?? null;
	}

	/**
	 * A guest links the Google account, keeping the same user and all its data. A Google account that is
	 * already in use (the user signed in before, maybe on another device) is signed in instead, and the
	 * guest's data is merged into it.
	 */
	async signInWithGoogle(): Promise<User> {
		const auth = await this._firebase.auth();
		if (!auth) throw new Error('Sign-in is only available in the browser.');

		const { GoogleAuthProvider, linkWithPopup, signInWithPopup } = await import('firebase/auth');
		const provider = new GoogleAuthProvider();
		return this._signIn(auth, {
			link: async (guest) => (await linkWithPopup(guest, provider)).user,
			signIn: async () => (await signInWithPopup(auth, provider)).user,
			credentialFromError: (error) => GoogleAuthProvider.credentialFromError(error as never),
		});
	}

	/**
	 * Sign in with Apple. In the native app Apple's own sheet gives the credential; in the browser a popup does.
	 * It links and merges the same way as Google.
	 */
	async signInWithApple(): Promise<User> {
		const auth = await this._firebase.auth();
		if (!auth) throw new Error('Sign-in is only available in the browser.');

		const { OAuthProvider, linkWithPopup, signInWithPopup, linkWithCredential, signInWithCredential } =
			await import('firebase/auth');

		if (isIosApp()) {
			const credential = await this._nativeAppleCredential();
			return this._signIn(auth, {
				link: async (guest) => (await linkWithCredential(guest, credential)).user,
				signIn: async () => (await signInWithCredential(auth, credential)).user,
				credentialFromError: (error) => OAuthProvider.credentialFromError(error as never),
			});
		}

		const provider = webAppleProvider(OAuthProvider);
		return this._signIn(auth, {
			link: async (guest) => (await linkWithPopup(guest, provider)).user,
			signIn: async () => (await signInWithPopup(auth, provider)).user,
			credentialFromError: (error) => OAuthProvider.credentialFromError(error as never),
		});
	}

	/** Signs out; a new guest takes its place at once, empty. */
	async signOut(): Promise<void> {
		const auth = await this._firebase.auth();
		if (auth) {
			const { signOut } = await import('firebase/auth');
			await signOut(auth);
		}
	}

	/**
	 * Deletes the user and everything stored for them, then the progress kept on this device; a new guest follows.
	 * Firebase only deletes a user who signed in recently, so a Google or Apple user signs in again first; that also
	 * confirms it is really the owner. For Apple, the fresh authorization also lets Firebase revoke the Apple token.
	 */
	async deleteAccount(): Promise<void> {
		const auth = await this._firebase.auth();
		const user = auth?.currentUser;
		if (!user) throw new Error('Not signed in.');

		const { deleteUser, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } =
			await import('firebase/auth');
		const hasApple = user.providerData.some((info) => info.providerId === 'apple.com');
		if (hasApple) {
			if (isIosApp()) await reauthenticateWithCredential(user, await this._nativeAppleCredential());
			else await reauthenticateWithPopup(user, webAppleProvider(OAuthProvider));
		} else if (!user.isAnonymous) {
			await reauthenticateWithPopup(user, new GoogleAuthProvider());
		}
		await this._account.deleteData(user.uid);
		await deleteUser(user);
		localStorage.removeItem(PRACTICE_STORAGE_KEY);
		localStorage.removeItem(SYSTEMS_STORAGE_KEY);
		localStorage.removeItem(READING_STORAGE_KEY);
	}

	/** Links a guest to the account from the flow, or signs in; merges the guest's data when that account already exists. */
	private async _signIn(auth: Auth, flow: SignInFlow): Promise<User> {
		const guest = auth.currentUser?.isAnonymous ? auth.currentUser : null;

		let user: User;
		try {
			user = guest ? await flow.link(guest) : await flow.signIn();
		} catch (error) {
			const credential = flow.credentialFromError(error);
			if (!guest || (error as { code?: string }).code !== 'auth/credential-already-in-use' || !credential) throw error;
			const { signInWithCredential } = await import('firebase/auth');
			const guestScores = await this._data.loadScores(guest.uid);
			user = (await signInWithCredential(auth, credential)).user;
			await this._data.mergeScores(user.uid, guestScores);
		}

		this.user.set(user);
		await this._account.saveIdentity(user);
		return user;
	}

	/** The Apple sheet in the native app, with a nonce so Firebase can check that the token is for this sign-in. */
	private async _nativeAppleCredential(): Promise<AuthCredential> {
		const { OAuthProvider } = await import('firebase/auth');
		const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

		const rawNonce = randomNonce();
		const { response } = await SignInWithApple.authorize({
			clientId: APP_ID,
			redirectURI: APPLE_REDIRECT_URI,
			scopes: 'email name',
			nonce: await sha256Hex(rawNonce),
		});
		return new OAuthProvider('apple.com').credential({
			idToken: response.identityToken,
			rawNonce,
			accessToken: response.authorizationCode,
		});
	}

	private async _restore(): Promise<void> {
		const auth = await this._firebase.auth();
		if (!auth) {
			this.user.set(null);
			return;
		}

		const { onAuthStateChanged } = await import('firebase/auth');
		await new Promise<void>((resolve) => {
			onAuthStateChanged(auth, (user) => {
				if (user) {
					this.user.set(user);
					resolve();
				} else {
					// nobody yet, or just signed out: a guest takes over
					void this._signInAsGuest(auth).catch((error) => {
						console.error('Could not sign in as a guest.', error);
						this.user.set(null);
						resolve();
					});
				}
			});
		});
	}

	private async _signInAsGuest(auth: Auth) {
		const { signInAnonymously } = await import('firebase/auth');
		await signInAnonymously(auth);
	}
}

/** The picture of the user. Linking Google to a guest leaves `photoURL` empty on the user, while the Google
 * profile (with the picture) sits in `providerData`, so look there too.
 */
export function userPhoto(user: User | null | undefined): string | null {
	return user?.photoURL || user?.providerData.find((info) => info.photoURL)?.photoURL || null;
}

/** The Apple provider for the browser popup, asking for the email and the name. */
function webAppleProvider(OAuthProvider: typeof import('firebase/auth').OAuthProvider) {
	const provider = new OAuthProvider('apple.com');
	provider.addScope('email');
	provider.addScope('name');
	return provider;
}

/**
 * The Apple sheet plugin is iOS only; Android uses the browser popup, like Google. The Capacitor bridge sets
 * window.Capacitor inside the app; checked without loading @capacitor/core.
 */
function isIosApp(): boolean {
	return (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'ios';
}

function randomNonce(): string {
	return hex(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256Hex(text: string): Promise<string> {
	return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

function hex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
