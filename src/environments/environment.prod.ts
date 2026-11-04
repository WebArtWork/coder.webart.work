export const environment: {
	apiUrl: string;
	appVersion: string;
	production: boolean;
	companyId: string;
	defaultLanguage: string;
	languages: AppLanguage[];
	/** Public web config: safe to ship. Access is enforced by Firebase Auth and Firestore rules. */
	firebase: {
		apiKey: string;
		authDomain: string;
		projectId: string;
		storageBucket: string;
		messagingSenderId: string;
		appId: string;
		measurementId: string;
	};
} = {
	apiUrl: '',
	appVersion: '1.0.0',
	production: true,
	companyId: '',
	firebase: {
		apiKey: 'AIzaSyDb49i_eK3s59BlAEQYa-HNGFF0M2Fteyw',
		authDomain: 'coder-50e2e.firebaseapp.com',
		projectId: 'coder-50e2e',
		storageBucket: 'coder-50e2e.firebasestorage.app',
		messagingSenderId: '759146969483',
		appId: '1:759146969483:web:83248cb585d9931be2d78e',
		measurementId: 'G-FBS50LK6C5',
	},
	defaultLanguage: 'en',
	languages: [
		{
			code: 'en',
			name: 'English',
			nativeName: 'English',
			flagSrc: 'flags/united-kingdom.svg',
			htmlLang: 'en',
			population: 280,
		},
		{
			code: 'ua',
			name: 'Ukrainian',
			nativeName: 'Українська',
			flagSrc: 'flags/ukraine.svg',
			htmlLang: 'uk',
			population: 35,
		},
	],
};

export interface AppLanguage {
	code: string;
	name: string;
	nativeName: string;
	flagSrc: string;
	htmlLang: string;
	population: number;
}
