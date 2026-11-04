export interface PlanDay {
	/** 0 = Sunday, matching `Date.getDay()`. */
	day: number;
	label: string;
	title: string;
	detail: string;
	minutes: number;
	action: string;
	path: string;
	query?: Record<string, string>;
}

/** Every day starts with the daily puzzle; the focus below is the extra work for that day. */
export const DAILY_MINUTES = 5;

export const WEEK_PLAN: PlanDay[] = [
	{
		day: 1,
		label: 'Mon',
		title: 'Mate in 1',
		detail: 'A run of mates in one. Check every check before you move.',
		minutes: 10,
		action: 'Start practice',
		path: '/practices/mate-in-one',
	},
	{
		day: 2,
		label: 'Tue',
		title: 'Candidate moves',
		detail: 'Three positions with several good moves. Name them all before you commit.',
		minutes: 20,
		action: 'Practice candidate moves',
		path: '/practices/good-moves',
	},
	{
		day: 3,
		label: 'Wed',
		title: 'Tactics',
		detail: 'Tactics from real games, one try each. See the replies before you move.',
		minutes: 15,
		action: 'Start practice',
		path: '/practices/tactics',
	},
	{
		day: 4,
		label: 'Thu',
		title: 'Critical decisions',
		detail: 'Three positions where the game turned. Find every move that keeps it.',
		minutes: 15,
		action: 'Practice decisions',
		path: '/practices/good-moves',
		query: { category: 'criticalDecision' },
	},
	{
		day: 5,
		label: 'Fri',
		title: 'Endgames',
		detail: 'Three endgames. Count pawns, activate the king, then name your moves.',
		minutes: 15,
		action: 'Practice endgames',
		path: '/practices/good-moves',
		query: { category: 'endgame' },
	},
];
