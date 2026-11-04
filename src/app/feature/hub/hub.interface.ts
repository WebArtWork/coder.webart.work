/** One row on a hub page (Practice, Library). */
export interface HubItem {
	title: string;
	detail: string;
	path: string;
	query?: Record<string, string>;
}
