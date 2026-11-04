import { IconName } from '../components/icon/icon.data';

export interface NavLink {
	label: string;
	path: string;
	icon: IconName;
	/** URL prefixes that mark this link as current; defaults to `path`. */
	matches?: string[];
}

/** Each link opens a hub; every mode page sits under its hub's path, so the prefix match marks it. */
export const NAV_LINKS: NavLink[] = [
	{ label: 'Theory', path: '/theories', icon: 'study' },
	{ label: 'Practice', path: '/practices', icon: 'play' },
];
