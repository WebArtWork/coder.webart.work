import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
	STAGES,
	deepPoolSize,
	defaultConfig,
	maxCandidates,
	quickPoolSize,
	type Config,
	type Stage,
} from './config.ts';
import { ENRICH_DEPTH, enrichGame } from './analysis/enrich.ts';
import { analyseGame, deepPlies, quickPlies, type CandidateGame, type PassOptions } from './analysis/game.ts';
import { prescore } from './analysis/signals.ts';
import { inconsistency, replay } from './chess/replay.ts';
import { EnginePool } from './engine/pool.ts';
import { buildRecord, type GameRecord } from './output/record.ts';
import { validateGame } from './output/schema.ts';
import { asSelectable, loadHistory, nextArchive, readDataset, saveDataset, saveHistory } from './dataset.ts';
import { findArchives, findEngine, rootDir } from './paths.ts';
import { rejectHeaders } from './pgn/filter.ts';
import { parseHeaders, parseMovetext } from './pgn/parse.ts';
import { readGames, type Cursor, type ReadStats } from './pgn/reader.ts';
import { Progress, bytes, duration, eta, log } from './progress.ts';
import { selectDiverse } from './similarity/select.ts';
import { Store, type Pass } from './store.ts';

interface ScanCounts {
	scanned: number;
	passed: number;
	candidates: number;
	rejected: Record<string, number>;
	finished: boolean;
	/** The archive was read to its end in this batch. */
	endOfArchive?: boolean;
}

interface Context {
	config: Config;
	store: Store;
	stop: { requested: boolean };
	pool: EnginePool | null;
	onProgress: (stage: Stage, done: number) => void;
}

export interface RunHooks {
	/** Set `requested` to stop gracefully, as Ctrl+C does. */
	stop?: { requested: boolean };
	/** Called after each game of a stage is handled. */
	onProgress?: (stage: Stage, done: number) => void;
}

/** Runs (or resumes) the import. Returns the process exit code. */
export async function run(overrides: Partial<Config>, hooks: RunHooks = {}): Promise<number> {
	const workDir = overrides.workDir ?? defaultConfig().workDir;
	await mkdir(workDir, { recursive: true });
	const store = new Store(path.join(workDir, 'import.sqlite'));
	const stop = hooks.stop ?? { requested: false };
	const onSignal = () => {
		if (stop.requested) process.exit(130);
		stop.requested = true;
		log('\nStopping after the current step… (Ctrl+C again to abort; run the import again to continue)');
	};
	process.on('SIGINT', onSignal);

	const context: Context = { config: defaultConfig(), store, stop, pool: null, onProgress: hooks.onProgress ?? (() => {}) };
	try {
		const saved = store.getMeta<Config>('config');
		const savedStage = store.getMeta<Stage | 'done'>('stage');
		const unfinished = Boolean(saved && savedStage && savedStage !== 'done');
		if (unfinished && !overrides.fresh) {
			context.config = { ...defaultConfig(), ...saved, ...overrides };
			log(`Continuing the unfinished batch at stage "${savedStage}" (--fresh to discard it).`);
		} else {
			if (unfinished) log('Discarding the unfinished batch (--fresh).');
			store.resetRun();
			context.config = { ...defaultConfig(), ...overrides };
			// a new batch continues in the archive where the previous batch stopped
			const history = await loadHistory(context.config.history, context.config.output);
			if (!context.config.input) {
				const archive = nextArchive(history, findArchives());
				if (!archive) {
					throw new Error(
						'No archive left to import: every lichess_db_*.pgn.zst next to the project is fully read. ' +
							'Download a new month from https://database.lichess.org/ or pass --input.',
					);
				}
				context.config.input = archive;
			}
			const progress = history.archives[path.basename(context.config.input)];
			if (progress?.cursor) {
				store.setMeta('cursor', progress.cursor);
				log(`Continuing ${path.basename(context.config.input)} after ${progress.gamesRead.toLocaleString()} games read before.`);
			}
			store.setMeta('batchStartedAt', new Date().toISOString());
			store.setMeta('stage', 'scan');
		}
		store.setMeta('config', context.config);
		const existing = await readDataset(context.config.output); // fails fast on a foreign games.json
		describe(context.config, existing.length);

		let stage: Stage | 'done' = store.getMeta<Stage | 'done'>('stage') ?? 'scan';
		while (stage !== 'done') {
			const started = Date.now();
			const complete = await STAGE_RUNNERS[stage](context);
			if (!complete) {
				log(`Interrupted during "${stage}". Run "npm run games:import" again to continue.`);
				return 130;
			}
			log(`✓ ${stage} (${duration((Date.now() - started) / 1000)})`);
			const finished: Stage = stage;
			const following = (STAGES[STAGES.indexOf(finished) + 1] as Stage | undefined) ?? 'done';
			stage = following;
			store.setMeta('stage', stage);
			if (context.config.until === finished && following !== 'done') {
				log(`Stopped after "${finished}" (--until). Run the import again to continue.`);
				return 0;
			}
		}
		return 0;
	} finally {
		process.off('SIGINT', onSignal);
		context.pool?.close();
		store.close();
	}
}

const STAGE_RUNNERS: Record<Stage, (context: Context) => Promise<boolean>> = {
	scan,
	quick: (context) => enginePass(context, 1),
	deep: (context) => enginePass(context, 2),
	select,
	export: exportDataset,
};

function describe(config: Config, existing: number): void {
	const rel = (file: string) => path.relative(rootDir, file) || '.';
	log(`Input:  ${rel(config.input)}`);
	log(`Output: ${rel(config.output)}${config.appDir ? ` (+ app copy in ${rel(config.appDir)})` : ''}, ${existing.toLocaleString()} games now`);
	log(
		`Scan ${config.maxScan.toLocaleString()} games → quick pass ${quickPoolSize(config)} → deep pass ` +
			`${deepPoolSize(config)} → add up to ${config.maxExport}; ratings ${config.minRating}–${config.maxRating}, ` +
			`${config.speeds.join('/')}, depth ${config.quickDepth}/${config.depth}, ${config.workers} workers`,
	);
}

// ── scan: stream the archive, filter, replay, prescore, store candidates ──────────────────────

async function scan(context: Context): Promise<boolean> {
	const { config, store, stop } = context;
	const counts: ScanCounts = store.getMeta<ScanCounts>('scanCounts') ?? {
		scanned: 0,
		passed: 0,
		candidates: 0,
		rejected: {},
		finished: false,
	};
	if (counts.finished || counts.scanned >= config.maxScan) return true;

	const cursor = store.getMeta<Cursor>('cursor') ?? { frame: 0, pos: 0 };
	const stats: ReadStats = { bytesRead: 0, totalBytes: 0 };
	const startedAt = Date.now();
	const startedWith = counts.scanned;
	const keep = maxCandidates(config);
	// games imported before (even if removed since) or already in the dataset are never taken again
	const history = await loadHistory(config.history, config.output);
	const known = new Set([...history.ids, ...(await readDataset(config.output)).map((game) => game.id)]);
	const progress = new Progress(() => {
		const rate = (counts.scanned - startedWith) / Math.max(1, (Date.now() - startedAt) / 1000);
		return (
			`scan: ${counts.scanned.toLocaleString()}/${config.maxScan.toLocaleString()} games, ` +
			`${counts.passed.toLocaleString()} passed filters, ${counts.candidates.toLocaleString()} candidates, ` +
			`${bytes(stats.bytesRead)}, ${Math.round(rate)}/s` +
			eta(counts.scanned - startedWith, config.maxScan - startedWith, startedAt)
		);
	});

	let batch: { game: CandidateGame; hash: string }[] = [];
	let last: Cursor = cursor;
	const commit = () => {
		store.transaction(() => {
			for (const { game, hash } of batch) store.insertCandidate(game, hash);
			if (counts.candidates + batch.length > keep * 1.2) store.pruneCandidates(keep);
			counts.candidates = store.countCandidates();
			store.setMeta('cursor', last);
			store.setMeta('scanCounts', counts);
		});
		batch = [];
	};

	let reachedEnd = true;
	for await (const raw of readGames(config.input, cursor, stats)) {
		counts.scanned++;
		const candidate = examine(raw.text, config, counts, known);
		if (candidate) batch.push(candidate);
		last = raw.end;
		context.onProgress('scan', counts.scanned);
		if (batch.length >= 200 || counts.scanned % 5000 === 0) commit();
		if (counts.scanned >= config.maxScan || stop.requested) {
			reachedEnd = false;
			break;
		}
	}
	counts.finished = reachedEnd || counts.scanned >= config.maxScan;
	counts.endOfArchive = reachedEnd;
	commit();
	store.transaction(() => {
		store.pruneCandidates(keep);
		counts.candidates = store.countCandidates();
		store.setMeta('scanCounts', counts);
	});
	progress.done();
	const reasons = Object.entries(counts.rejected)
		.sort((a, b) => b[1] - a[1])
		.map(([reason, n]) => `${reason} ${n.toLocaleString()}`)
		.join(', ');
	log(`  rejected: ${reasons || 'none'}`);
	return counts.finished;
}

/** Filters and pre-scores one game; returns a candidate or null (counting the reason). */
function examine(
	text: string,
	config: Config,
	counts: ScanCounts,
	known: Set<string>,
): { game: CandidateGame; hash: string } | null {
	const reject = (reason: string) => {
		counts.rejected[reason] = (counts.rejected[reason] ?? 0) + 1;
		return null;
	};
	const { headers, movetextAt } = parseHeaders(text);
	const headerReason = rejectHeaders(headers, config);
	if (headerReason) return reject(headerReason);
	const id = (headers['Site'] ?? '').split('/').pop() as string;
	if (known.has(id)) return reject('imported before');

	const movetext = parseMovetext(text.slice(movetextAt));
	if (movetext.result && movetext.result !== headers['Result']) return reject('corrupt');
	if (movetext.san.length < config.minPlies) return reject('short');
	if (movetext.san.length > config.maxPlies) return reject('long');
	let game;
	try {
		game = replay(movetext.san);
	} catch {
		return reject('illegal');
	}
	if (inconsistency(game, headers['Result'])) return reject('corrupt');
	counts.passed++;

	const score = prescore(game, movetext.evals, headers['Result']);
	if (score.score < config.minPrescore) return reject('dull');
	const san = game.plies.map((ply) => ply.san);
	return {
		hash: createHash('sha1').update(san.join(' ')).digest('hex'),
		game: {
			id,
			headers,
			san,
			uci: game.plies.map((ply) => ply.uci),
			prescore: score.score,
			signals: score.signals,
		},
	};
}

// ── engine passes ──────────────────────────────────────────────────────────────────────────

function enginePool(context: Context): EnginePool {
	if (!context.pool) {
		const engine = findEngine(context.config.engine);
		log(`  engine: ${engine} × ${context.config.workers}`);
		context.pool = new EnginePool(engine, context.config.workers, { threads: 1, hash: context.config.hash }, context.store);
	}
	return context.pool;
}

async function enginePass(context: Context, pass: Pass): Promise<boolean> {
	const { config, store, stop } = context;
	const name = pass === 1 ? 'quick' : 'deep';
	const markKey = `${name}PoolMarked`;
	if (!store.getMeta<boolean>(markKey)) {
		if (pass === 1) {
			const size = store.markQuickPool(quickPoolSize(config));
			log(`  quick pool: ${size} of ${store.countCandidates()} candidates`);
		} else {
			// deep pool: a diverse pick over the quick results, a little looser than the final selection
			const picked = selectDiverse(store.selectables(1), {
				target: deepPoolSize(config),
				minQuality: config.minQuality * 0.8,
				minUniqueness: config.minUniqueness * 0.7,
				mix: config.difficultyMix,
				practiceMix: config.practiceMix,
			});
			store.markDeepPool(picked.map((item) => item.id));
			log(`  deep pool: ${picked.length} games`);
		}
		store.setMeta(markKey, true);
	}

	const options: PassOptions = {
		depth: pass === 1 ? config.quickDepth : config.depth,
		multiPv: pass === 1 ? config.quickMultiPv : Math.min(5, config.multiPv),
		pvPlies: config.pvPlies,
		positionsPerGame: config.positionsPerGame,
		minPositions: config.minPositions,
		minPositionQuality: pass === 1 ? config.minPositionQuality * 0.8 : config.minPositionQuality,
	};
	const ids = store.pendingIds(pass);
	const total = store.poolSize(pass);
	if (!ids.length) return true;
	const pool = enginePool(context);
	let done = total - ids.length;
	const startedWith = done;
	let failed = 0;
	const startedAt = Date.now();
	const progress = new Progress(
		() =>
			`${name}: ${done}/${total} games, ${pool.stats.searches.toLocaleString()} searches, ` +
			`${pool.stats.cacheHits.toLocaleString()} cached` +
			(failed ? `, ${failed} failed` : '') +
			eta(done - startedWith, total - startedWith, startedAt),
	);

	let next = 0;
	const worker = async () => {
		while (next < ids.length && !stop.requested) {
			const id = ids[next++];
			const { game, quick } = store.getCandidate(id);
			const plies = pass === 1 ? quickPlies(game, config.quickPositions) : deepPlies(quick!, config.positionsPerGame);
			try {
				const analysis = await analyseGame(game, plies, pool, options);
				store.saveAnalysis(id, pass, analysis);
			} catch (error) {
				failed++;
				if (stop.requested) return;
				log(`\n  ${id}: ${(error as Error).message}`);
				store.saveAnalysis(id, pass, emptyAnalysis());
			}
			done++;
			context.onProgress(name, done);
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, config.workers * 2) }, worker));
	progress.done();
	return !stop.requested || done >= total;
}

function emptyAnalysis() {
	return {
		quality: 0,
		difficultyRating: 0,
		difficulty: 'beginner' as const,
		categories: [],
		themes: [],
		positions: [],
		analysed: [],
		tokens: [],
		fens: [],
	};
}

// ── selection and export ───────────────────────────────────────────────────────────────────

async function select(context: Context): Promise<boolean> {
	const { config, store } = context;
	const items = store.selectables(2);
	const existing = (await readDataset(config.output)).map(asSelectable);
	const selected = selectDiverse(items, {
		target: config.maxExport,
		minQuality: config.minQuality,
		minUniqueness: config.minUniqueness,
		mix: config.difficultyMix,
		practiceMix: config.practiceMix,
		fixed: existing,
	});
	store.saveSelection(selected);
	const qualifying = items.filter((item) => item.quality >= config.minQuality).length;
	log(
		`  selected ${selected.length} new of ${items.length} analysed games (${qualifying} met min quality ${config.minQuality}), ` +
			`unique against ${existing.length} existing`,
	);
	if (selected.length < config.maxExport) {
		log(`  fewer than ${config.maxExport}: the rest were below quality or too similar; scan more games to fill up`);
	}
	return true;
}

async function exportDataset(context: Context): Promise<boolean> {
	const { config, store } = context;
	const existing = await readDataset(config.output);
	const present = new Set(existing.map((game) => game.id));
	// idempotent: a batch interrupted after writing must not add its games twice
	const selection = store.selection().filter((item) => !present.has(item.id));
	const importedAt = store.getMeta<string>('batchStartedAt') ?? new Date().toISOString();
	const levels: Record<string, number> = {};
	const categories: Record<string, number> = {};
	const added: GameRecord[] = [];
	let invalid = 0;
	let positions = 0;

	// the practice fields too, as `games:enrich` adds them to older games; several games at a time
	const records: GameRecord[] = [];
	for (const item of selection) {
		const { game, deep } = store.getCandidate(item.id);
		if (deep) records.push(buildRecord(game, deep, item.uniqueness, importedAt));
	}
	const pool = records.length ? enginePool(context) : null;
	const enriched: GameRecord[] = [];
	const batch = Math.max(1, config.workers * 2);
	for (let i = 0; i < records.length; i += batch) {
		const depth = Math.min(ENRICH_DEPTH, config.depth);
		enriched.push(...(await Promise.all(records.slice(i, i + batch).map((record) => enrichGame(record, (request) => pool!.analyse(request), depth)))));
	}

	for (const record of enriched) {
		const errors = validateGame(record);
		if (errors.length) {
			invalid++;
			log(`  skipping invalid ${record.id}: ${errors.slice(0, 3).join('; ')}`);
			continue;
		}
		levels[record.difficulty] = (levels[record.difficulty] ?? 0) + 1;
		for (const category of record.categories) categories[category] = (categories[category] ?? 0) + 1;
		positions += record.trainingPositions.length;
		added.push(record);
	}

	if (added.length) {
		await saveDataset([...existing, ...added], config);
	} else {
		log('  nothing new to add: games.json is left untouched (scan more games or lower --min-quality)');
	}
	// remember where this archive was left and every game taken, also when nothing was added
	const history = await loadHistory(config.history, config.output);
	const taken = new Set(history.ids);
	const name = path.basename(config.input);
	const previous = history.archives[name];
	const scanned = store.getMeta<ScanCounts>('scanCounts');
	history.archives[name] = {
		cursor: store.getMeta<Cursor>('cursor') ?? previous?.cursor ?? null,
		gamesRead: (previous?.gamesRead ?? 0) + (scanned?.scanned ?? 0),
		finished: Boolean(scanned?.endOfArchive),
		updatedAt: new Date().toISOString(),
	};
	history.ids = [...history.ids, ...added.map((game) => game.id).filter((id) => !taken.has(id))];
	await saveHistory(config.history, config.output, history);
	if (history.archives[name].finished) log(`  ${name} is fully read; the next batch moves on to the next archive.`);

	const rel = path.relative(rootDir, config.output);
	log(
		`  added ${added.length} games, ${positions} training positions → ${rel} now holds ` +
			`${existing.length + added.length} games${invalid ? ` (${invalid} invalid skipped)` : ''}`,
	);
	if (added.length) {
		log(`  levels: ${Object.entries(levels).map(([level, n]) => `${level} ${n}`).join(', ')}`);
		log(`  categories: ${Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}`);
	}
	return true;
}
