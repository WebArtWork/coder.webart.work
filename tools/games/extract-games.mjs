/**
 * Sample games from a Lichess monthly archive into src/data/game/games.json.
 *
 *   node tools/games/extract-games.mjs --input ../lichess_db_standard_rated_2026-09.pgn.zst --limit 10000
 *
 * The archive is read once, frame by frame; matching games are reservoir-sampled so the pick is spread over
 * the whole month (or over the first --max-gb of it). Positions are added later by analyze-games.mjs.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { gamesFile, parseArgs, parseMovetext, rootDir, writeGames, zstdLines } from './lib.mjs';

const args = parseArgs({
	input: path.resolve(rootDir, '../lichess_db_standard_rated_2026-09.pgn.zst'),
	output: gamesFile,
	limit: 10000,
	/** Both players at least this rated. */
	minElo: 2200,
	/** Full moves. */
	minMoves: 25,
	speeds: 'blitz,rapid,classical',
	/** Keep only games Lichess has analysed: their eval curve saves a full engine pass. */
	requireEval: true,
	/** Stop reading after this many compressed gigabytes; 0 reads the whole archive. */
	maxGb: 0,
	seed: 1,
});

const speeds = new Set(args.speeds.split(','));
const random = mulberry32(args.seed);
const reservoir = [];
let seen = 0;
let matched = 0;
let headers = {};
let movetext = [];

let bytesRead = 0;
const progress = setInterval(() => {
	process.stderr.write(`\r${(bytesRead / 1e9).toFixed(1)} GB, ${seen} games, ${matched} matched`);
}, 2000);

const lines = zstdLines(args.input, {
	maxBytes: args.maxGb ? args.maxGb * 1e9 : Infinity,
	onFrame: (offset) => (bytesRead = offset),
});
for await (const line of lines) {
	if (line === null) {
		// damaged frame: the game around it is incomplete
		headers = {};
		movetext = [];
	} else if (line.startsWith('[')) {
		if (movetext.length) flush();
		const match = line.match(/^\[(\w+) "(.*)"\]$/);
		if (match) headers[match[1]] = match[2];
	} else if (line.trim()) {
		movetext.push(line);
	}
}
if (movetext.length) flush();
clearInterval(progress);

const games = reservoir.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
await mkdir(path.dirname(args.output), { recursive: true });
await writeGames(args.output, games);
console.log(`\n${seen} games read, ${matched} matched, ${games.length} written to ${path.relative(rootDir, args.output)}`);

function flush() {
	seen++;
	const game = toGame(headers, movetext.join(' '));
	headers = {};
	movetext = [];
	if (!game) return;
	matched++;
	if (reservoir.length < args.limit) {
		reservoir.push(game);
	} else {
		const index = Math.floor(random() * matched);
		if (index < args.limit) reservoir[index] = game;
	}
}

function toGame(h, text) {
	const speed = h.Event?.match(/^Rated (\w+) game$/)?.[1]?.toLowerCase();
	if (!speeds.has(speed)) return null;
	if (h.Termination !== 'Normal' || h.FEN) return null;
	const whiteElo = Number(h.WhiteElo);
	const blackElo = Number(h.BlackElo);
	if (!(whiteElo >= args.minElo && blackElo >= args.minElo)) return null;
	if (args.requireEval && !text.includes('%eval')) return null;
	const { moves, evals } = parseMovetext(text);
	if (moves.length < args.minMoves * 2) return null;
	if (args.requireEval && !evals) return null;
	return {
		id: h.Site.split('/').pop(),
		date: `${h.UTCDate.replaceAll('.', '-')}T${h.UTCTime}Z`,
		speed,
		timeControl: h.TimeControl,
		white: { name: h.White, elo: whiteElo, title: h.WhiteTitle },
		black: { name: h.Black, elo: blackElo, title: h.BlackTitle },
		result: h.Result,
		termination: h.Termination,
		eco: h.ECO,
		opening: h.Opening,
		moves: moves.join(' '),
		evals,
		positions: null,
	};
}

function mulberry32(seed) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
