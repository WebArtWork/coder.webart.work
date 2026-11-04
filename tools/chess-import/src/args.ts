import path from 'node:path';
import { DIFFICULTIES, PRACTICE_TAGS, SPEEDS, STAGES, type Config, type Speed } from './config.ts';

type Kind = 'path' | 'string' | 'number' | 'boolean' | 'speeds' | 'list' | 'mix' | 'practiceMix' | 'stage';

interface Option {
	key: keyof Config;
	kind: Kind;
	help: string;
}

const OPTIONS: Record<string, Option> = {
	input: { key: 'input', kind: 'path', help: 'archive to read (default: next unfinished lichess_db_*.pgn.zst)' },
	output: { key: 'output', kind: 'path', help: 'games.json path (the app copy goes to --app-dir)' },
	'work-dir': { key: 'workDir', kind: 'path', help: 'checkpoint, candidate and engine-cache directory' },
	engine: { key: 'engine', kind: 'path', help: 'Stockfish binary (default: STOCKFISH_PATH, ../../stockfish, npm build)' },
	fresh: { key: 'fresh', kind: 'boolean', help: 'discard an unfinished batch instead of continuing it' },
	history: { key: 'history', kind: 'path', help: 'file remembering imported games and the archive position' },
	until: { key: 'until', kind: 'stage', help: `stop after a stage: ${STAGES.join(', ')}` },
	'max-scan': { key: 'maxScan', kind: 'number', help: 'archive games read per batch' },
	'max-export': { key: 'maxExport', kind: 'number', help: 'games added per batch (upper bound)' },
	'min-rating': { key: 'minRating', kind: 'number', help: 'both players at least this rated' },
	'max-rating': { key: 'maxRating', kind: 'number', help: 'both players at most this rated' },
	'max-rating-gap': { key: 'maxRatingGap', kind: 'number', help: 'largest rating difference between the players' },
	speeds: { key: 'speeds', kind: 'speeds', help: `comma list of ${SPEEDS.join(', ')}` },
	terminations: { key: 'terminations', kind: 'list', help: 'comma list of Lichess Termination values' },
	'allow-bots': { key: 'allowBots', kind: 'boolean', help: 'keep games played by BOT accounts' },
	'min-plies': { key: 'minPlies', kind: 'number', help: 'shortest game, in half-moves' },
	'max-plies': { key: 'maxPlies', kind: 'number', help: 'longest game, in half-moves' },
	'min-prescore': { key: 'minPrescore', kind: 'number', help: 'heuristic score (0-100) to become a candidate' },
	'max-candidates': { key: 'maxCandidates', kind: 'number', help: 'candidates kept on disk (0 = 2 x quick pool)' },
	workers: { key: 'workers', kind: 'number', help: 'parallel Stockfish processes' },
	hash: { key: 'hash', kind: 'number', help: 'Stockfish hash per process, MB' },
	'quick-depth': { key: 'quickDepth', kind: 'number', help: 'depth of the preliminary pass' },
	'quick-multipv': { key: 'quickMultiPv', kind: 'number', help: 'lines in the preliminary pass' },
	'quick-positions': { key: 'quickPositions', kind: 'number', help: 'positions per game in the preliminary pass' },
	'quick-pool': { key: 'quickPool', kind: 'number', help: 'games given the preliminary pass (0 = 6 x max-export)' },
	depth: { key: 'depth', kind: 'number', help: 'depth of the deep pass' },
	multipv: { key: 'multiPv', kind: 'number', help: 'candidate moves per position in the deep pass (max 5 kept)' },
	'deep-pool': { key: 'deepPool', kind: 'number', help: 'games given the deep pass (0 = 1.6 x max-export)' },
	'pv-plies': { key: 'pvPlies', kind: 'number', help: 'plies kept per principal variation' },
	positions: { key: 'positionsPerGame', kind: 'number', help: 'training positions per game (max)' },
	'min-positions': { key: 'minPositions', kind: 'number', help: 'training positions a game needs to be exported' },
	'min-position-quality': {
		key: 'minPositionQuality',
		kind: 'number',
		help: 'quality score (0-100) a single position needs to be used',
	},
	'min-quality': { key: 'minQuality', kind: 'number', help: 'quality score (0-100) a game needs' },
	'min-uniqueness': { key: 'minUniqueness', kind: 'number', help: 'uniqueness score (0-100) a game needs' },
	'difficulty-mix': {
		key: 'difficultyMix',
		kind: 'mix',
		help: 'wanted shares, e.g. beginner=0.3,intermediate=0.5,advanced=0.15,expert=0.05',
	},
	'practice-mix': {
		key: 'practiceMix',
		kind: 'practiceMix',
		help: `wanted shares of games feeding each practice (${PRACTICE_TAGS.join(', ')}), e.g. tactics=0.3,endgame=0.2`,
	},
	'app-dir': {
		key: 'appDir',
		kind: 'path',
		help: "the app's copy of the games (catalog, daily schedule, one file per game); --app-dir= with nothing skips it",
	},
};

export const COMMANDS = ['import', 'clear', 'wipe', 'refresh', 'lookahead', 'enrich'] as const;
export type Command = (typeof COMMANDS)[number];

export interface ParsedArgs {
	command: Command;
	overrides: Partial<Config>;
	/** `clear`: how many of the oldest games to remove. */
	count: number;
	help: boolean;
}

/**
 * `[command] --key value --key=value --flag --no-flag`. Only flags given end up in `overrides`.
 * The command defaults to `import`.
 */
export function parseArgs(argv: string[]): ParsedArgs {
	const overrides: Record<string, unknown> = {};
	let help = false;
	let command: Command = 'import';
	let count = 1000;
	if (argv[0] && !argv[0].startsWith('-')) {
		if (!COMMANDS.includes(argv[0] as Command)) throw new Error(`Unknown command ${argv[0]} (${COMMANDS.join(', ')})`);
		command = argv[0] as Command;
		argv = argv.slice(1);
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			help = true;
			continue;
		}
		if (!arg.startsWith('--')) throw new Error(`Unexpected argument ${arg}`);
		let [name, value] = splitOnce(arg.slice(2), '=');
		if (name === 'count') {
			count = Number(value ?? argv[++i]);
			if (!Number.isInteger(count) || count < 0) throw new Error('--count expects a whole number');
			continue;
		}
		let negated = false;
		if (!(name in OPTIONS) && name.startsWith('no-') && OPTIONS[name.slice(3)]?.kind === 'boolean') {
			name = name.slice(3);
			negated = true;
		}
		const option = OPTIONS[name];
		if (!option) throw new Error(`Unknown option --${name} (see --help)`);
		if (option.kind === 'boolean') {
			if (value === undefined && (argv[i + 1] === 'true' || argv[i + 1] === 'false')) value = argv[++i];
			overrides[option.key] = negated ? false : value === undefined || value === 'true';
			continue;
		}
		if (value === undefined) {
			value = argv[++i];
			if (value === undefined) throw new Error(`--${name} needs a value`);
		}
		overrides[option.key] = convert(name, option.kind, value);
	}
	return { command, overrides: overrides as Partial<Config>, count, help };
}

function convert(name: string, kind: Kind, value: string): unknown {
	switch (kind) {
		case 'path':
			// empty stays empty: no engine given, no archive given, no app copy
			return value === '' ? '' : path.resolve(value);
		case 'number': {
			const number = Number(value);
			if (!Number.isFinite(number) || number < 0) throw new Error(`--${name} expects a non-negative number`);
			return number;
		}
		case 'list':
			return value.split(',').map((item) => item.trim()).filter(Boolean);
		case 'speeds': {
			const speeds = value.split(',').map((item) => item.trim());
			for (const speed of speeds) {
				if (!SPEEDS.includes(speed as Speed)) throw new Error(`--${name}: unknown speed ${speed}`);
			}
			return speeds;
		}
		case 'stage':
			if (!STAGES.includes(value as (typeof STAGES)[number])) throw new Error(`--${name}: unknown stage ${value}`);
			return value;
		case 'mix':
			return shares(name, value, DIFFICULTIES);
		case 'practiceMix':
			return shares(name, value, PRACTICE_TAGS);
		default:
			return value;
	}
}

/** `key=share,…` over `keys`; keys left out get 0. */
function shares(name: string, value: string, keys: readonly string[]): Record<string, number> {
	const mix = Object.fromEntries(keys.map((key) => [key, 0]));
	for (const part of value.split(',')) {
		const [key, share] = splitOnce(part.trim(), '=');
		if (!keys.includes(key) || !(Number(share) >= 0)) throw new Error(`--${name}: expected key=share pairs, got ${part}`);
		mix[key] = Number(share);
	}
	return mix;
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
	const index = text.indexOf(separator);
	return index < 0 ? [text, undefined] : [text.slice(0, index), text.slice(index + 1)];
}

export function usage(): string {
	const width = Math.max(...Object.keys(OPTIONS).map((name) => name.length)) + 4;
	const lines = Object.entries(OPTIONS).map(([name, option]) => `  --${name.padEnd(width)}${option.help}`);
	return [
		'Usage:',
		'  npm run games:import -- [options]   add a batch of new games (continues an unfinished batch)',
		'  npm run games:clear  -- [--count N] remove the N oldest games (default 1000)',
		'  npm run games:wipe                  remove all games',
		"  npm run games:refresh               rebuild the app's copy after editing games.json by hand",
		'  npm run games:lookahead -- [--fresh] build Look Ahead trees for positions without one (depth 16 unless --depth)',
		'  npm run games:enrich -- [--fresh]    add the practice fields to games not enriched yet (depth 12 unless --depth)',
		'',
		'Each batch streams the next part of the Lichess archive, scores games, analyses the',
		'promising ones with Stockfish and appends a diverse set of new training games to',
		'src/data/game/games.json. Games imported once (even if removed since) never come back.',
		'',
		'Options:',
		...lines,
		'  --help'.padEnd(width + 4) + 'show this help',
	].join('\n');
}
