import { Level, PuzzleCategory, PuzzleFilters, PuzzleMode } from './game.interface';

export interface FilterOption {
	value: string;
	label: string;
}

export const CATEGORY_LABELS: Record<PuzzleCategory, string> = {
	tactics: 'Tactics',
	calculation: 'Calculation',
	candidateMoves: 'Candidate moves',
	positional: 'Positional play',
	attack: 'Attack',
	defense: 'Defense',
	endgame: 'Endgame',
	criticalDecision: 'Critical decision',
};

export const LEVEL_LABELS: Record<Level, string> = {
	beginner: 'Beginner',
	intermediate: 'Intermediate',
	advanced: 'Advanced',
	expert: 'Expert',
};

/** Estimated training levels, not official ratings. */
export const LEVEL_RANGES: Record<Level, string> = {
	beginner: '500–1000',
	intermediate: '1000–1400',
	advanced: '1400–1800',
	expert: '1800+',
};

/** Training level of an estimated rating. */
export function levelOf(rating: number): Level {
	if (rating < 1000) return 'beginner';
	if (rating < 1400) return 'intermediate';
	if (rating < 1800) return 'advanced';
	return 'expert';
}

export const MODE_LABELS: Record<PuzzleMode, string> = {
	best: 'Best move',
	candidates: 'Good moves',
	line: 'Play the line',
};

export const THEME_LABELS: Record<string, string> = {
	fork: 'Fork',
	pin: 'Pin',
	skewer: 'Skewer',
	discoveredCheck: 'Discovered check',
	doubleCheck: 'Double check',
	sacrifice: 'Sacrifice',
	quietMove: 'Quiet move',
	hangingPiece: 'Hanging piece',
	mate: 'Mate',
	backRankMate: 'Back-rank mate',
	promotion: 'Promotion',
	underPromotion: 'Underpromotion',
	perpetualCheck: 'Perpetual check',
	stalemateTrap: 'Stalemate trap',
	outpost: 'Outpost',
	openFile: 'Open file',
	weakPawn: 'Weak pawn',
	passedPawn: 'Passed pawn',
	pawnBreak: 'Pawn break',
};

export const STRUCTURE_LABELS: Record<string, string> = {
	iqp: 'Isolated queen pawn',
	hangingPawns: 'Hanging pawns',
	oppositeBishops: 'Opposite-coloured bishops',
	bishopPair: 'Bishop pair',
	passedPawn: 'Passed pawn',
	doubledPawns: 'Doubled pawns',
	backwardPawn: 'Backward pawn',
};

export const ENDGAME_LABELS: Record<string, string> = {
	pawn: 'Pawn endgame',
	rook: 'Rook endgame',
	minor: 'Minor piece endgame',
	queen: 'Queen endgame',
	mixed: 'Mixed endgame',
};

export const SACRIFICE_LABELS: Record<string, string> = {
	sound: 'Sound sacrifice',
	unsound: 'Unsound sacrifice',
	unclear: 'Unclear sacrifice',
};

export const EMPTY_FILTERS: PuzzleFilters = {
	category: [],
	theme: [],
	level: [],
	mode: [],
	side: [],
	opening: [],
	structure: [],
	endgame: [],
	sacrifice: [],
	search: '',
};

/** The filters that are chip lists; `search` is a text field. */
export type FilterKey = Exclude<keyof PuzzleFilters, 'search'>;

export const FILTER_KEYS: FilterKey[] = ['category', 'theme', 'level', 'mode', 'side', 'opening', 'structure', 'endgame', 'sacrifice'];

export function themeLabel(theme: string): string {
	const mate = /^mateIn(\d)$/.exec(theme);
	if (mate) return `Mate in ${mate[1]}`;
	return THEME_LABELS[theme] ?? theme;
}

/**
 * What to do in a puzzle, e.g. "White to move. Find the best move.", as an English text to translate
 * with its `count`, the number of moves to find or play.
 */
export function instruction(
	mode: PuzzleMode,
	target: number,
	side: 'white' | 'black',
): { text: string; vars: { count: number } } {
	const vars = { count: target };
	const white = side === 'white';
	switch (mode) {
		case 'best':
			return { text: white ? 'White to move. Find the best move.' : 'Black to move. Find the best move.', vars };
		case 'candidates':
			return {
				text: white
					? 'White to move. Find the {count} good move.|White to move. Find the {count} good moves.'
					: 'Black to move. Find the {count} good move.|Black to move. Find the {count} good moves.',
				vars,
			};
		case 'line':
			return {
				text: white
					? 'White to move. Play the best line: {count} move.|White to move. Play the best line: {count} moves.'
					: 'Black to move. Play the best line: {count} move.|Black to move. Play the best line: {count} moves.',
				vars,
			};
		default:
			mode satisfies never;
			return { text: '', vars };
	}
}

/** "Sicilian Defense: Najdorf Variation" belongs to the family "Sicilian Defense". */
export function openingFamily(name: string | null | undefined): string {
	return (name ?? '').split(':')[0].trim() || 'Unknown opening';
}

/** "Sicilian Defense: Najdorf Variation" -> "Najdorf Variation". */
export function openingVariation(name: string | null | undefined): string {
	return name?.includes(':') ? name.slice(name.indexOf(':') + 1).trim() : '';
}

/** `<gameId>-<ply>`. */
export function puzzleId(game: string, ply: number): string {
	return `${game}-${ply}`;
}

export function parsePuzzleId(id: string): { game: string; ply: number } | null {
	const match = /^([A-Za-z0-9]+)-(\d+)$/.exec(id);
	return match ? { game: match[1], ply: Number(match[2]) } : null;
}

/** Filters preset in a URL, e.g. /random?category=endgame&level=beginner. */
export function readFilters(params: { get(name: string): string | null }): PuzzleFilters {
	const read = (key: FilterKey) => (params.get(key) ?? '').split(',').filter(Boolean);
	return {
		category: read('category'),
		theme: read('theme'),
		level: read('level'),
		mode: read('mode'),
		side: read('side'),
		opening: read('opening'),
		structure: read('structure'),
		endgame: read('endgame'),
		sacrifice: read('sacrifice'),
		search: params.get('search') ?? '',
	};
}

/** The non-empty filters as query params. */
export function filterParams(filters: PuzzleFilters): Record<string, string> {
	const params: Record<string, string> = {};
	for (const key of FILTER_KEYS) if (filters[key].length) params[key] = filters[key].join(',');
	if (filters.search.trim()) params['search'] = filters.search.trim();
	return params;
}

export function activeFilterCount(filters: PuzzleFilters): number {
	return FILTER_KEYS.reduce((total, key) => total + filters[key].length, 0) + (filters.search.trim() ? 1 : 0);
}
