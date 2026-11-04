import { DIFFICULTIES, PRACTICE_TAGS, type Difficulty, type PracticeTag } from '../config.ts';

export interface Selectable {
	id: string;
	quality: number;
	difficulty: Difficulty;
	tokens: string[];
	/** Position keys of the training positions: exact duplicates are never selected twice. */
	fens: string[];
	/** The practices its positions feed (see `practiceTags`). */
	tags?: PracticeTag[];
}

export interface SelectOptions {
	target: number;
	minQuality: number;
	minUniqueness: number;
	mix: Record<Difficulty, number>;
	/** Wanted share of games per practice; games feeding a practice that is short get a boost. */
	practiceMix?: Record<PracticeTag, number>;
	/** Games already in the dataset: new picks must be unique against them too. Never returned. */
	fixed?: Selectable[];
}

export interface Selected {
	id: string;
	rank: number;
	/** 0–100: 100 minus the highest similarity to any other game in the dataset. */
	uniqueness: number;
}

const HASHES = 64;
/** Below this many pair comparisons every pair is compared exactly; above it, only LSH neighbours. */
const EXACT_LIMIT = 30_000_000;
const BANDS = 16;
const ROWS = HASHES / BANDS;

/**
 * Greedy diverse selection: repeatedly take the game with the best quality × uniqueness ×
 * difficulty-mix balance × practice-mix balance, then lower the uniqueness of games similar to it. Small pools compare
 * every pair; large ones only compare MinHash LSH neighbours so the cost stays near-linear.
 * Stops early rather than pad the result with weak or duplicate games.
 */
export function selectDiverse(items: Selectable[], options: SelectOptions): Selected[] {
	const fixed = options.fixed ?? [];
	const pool = [...fixed, ...items.filter((item) => item.quality >= options.minQuality)];
	const sets = pool.map((item) => new Set(item.tokens));
	const exact = pool.length * Math.min(pool.length, options.target + fixed.length) <= EXACT_LIMIT;
	const index = exact ? null : new LshIndex(pool.map((item) => item.tokens));
	function* everyone(i: number) {
		for (let other = 0; other < pool.length; other++) if (other !== i) yield other;
	}
	const neighbours = (i: number): Iterable<number> => index?.neighbours(i) ?? everyone(i);
	const maxSim = new Float64Array(pool.length);
	const alive = new Uint8Array(pool.length).fill(1);
	const takenFens = new Set<string>();
	const counts = Object.fromEntries(DIFFICULTIES.map((level) => [level, 0])) as Record<Difficulty, number>;
	const tagCounts = Object.fromEntries(PRACTICE_TAGS.map((tag) => [tag, 0])) as Record<PracticeTag, number>;
	const practiceTotal = PRACTICE_TAGS.reduce((sum, tag) => sum + (options.practiceMix?.[tag] ?? 0), 0);
	const mixTotal = DIFFICULTIES.reduce((sum, level) => sum + options.mix[level], 0) || 1;
	const mixMax = Math.max(...DIFFICULTIES.map((level) => options.mix[level])) || 1;
	/** Indexes in `pool` of every game in the dataset: the fixed ones first, then new picks. */
	const members: number[] = [];

	const take = (i: number) => {
		alive[i] = 0;
		members.push(i);
		counts[pool[i].difficulty]++;
		for (const tag of pool[i].tags ?? []) tagCounts[tag]++;
		for (const fen of pool[i].fens) takenFens.add(fen);
		for (const other of neighbours(i)) {
			if (alive[other]) maxSim[other] = Math.max(maxSim[other], jaccard(sets[i], sets[other]));
		}
	};
	for (let i = 0; i < fixed.length; i++) take(i);

	const mixFactor = (level: Difficulty) => {
		const share = options.mix[level] / mixTotal;
		const base = 0.75 + 0.5 * (options.mix[level] / mixMax);
		if (share === 0) return 0.3;
		const current = members.length ? counts[level] / members.length : 0;
		return members.length >= 10 && current >= share + 0.05 ? base * 0.6 : base;
	};

	/** Up to 1.3 for a game feeding the practice furthest below its share; 0.9 when all it feeds are full. */
	const practiceFactor = (tags: PracticeTag[] | undefined) => {
		if (!practiceTotal || !members.length) return 1;
		let need = -1;
		for (const tag of tags ?? []) {
			const share = (options.practiceMix?.[tag] ?? 0) / practiceTotal;
			if (share) need = Math.max(need, (share - tagCounts[tag] / members.length) / share);
		}
		return need < 0 ? 0.9 : 1 + 0.3 * Math.min(1, need);
	};

	while (members.length - fixed.length < options.target) {
		let best = -1;
		let bestValue = -Infinity;
		for (let i = fixed.length; i < pool.length; i++) {
			if (!alive[i]) continue;
			const uniqueness = 100 * (1 - maxSim[i]);
			if (uniqueness < options.minUniqueness) {
				alive[i] = 0;
				continue;
			}
			const value =
				pool[i].quality * (0.35 + 0.65 * (uniqueness / 100)) * mixFactor(pool[i].difficulty) * practiceFactor(pool[i].tags);
			if (value > bestValue) {
				bestValue = value;
				best = i;
			}
		}
		if (best < 0) break;
		if (pool[best].fens.some((fen) => takenFens.has(fen))) {
			alive[best] = 0;
			continue;
		}
		take(best);
	}

	// final uniqueness: against every other game in the dataset, not only the earlier picks
	const inDataset = new Set(members);
	return members.slice(fixed.length).map((i, rank) => {
		let highest = 0;
		for (const other of index ? index.neighbours(i) : members) {
			if (other !== i && inDataset.has(other)) highest = Math.max(highest, jaccard(sets[i], sets[other]));
		}
		return { id: pool[i].id, rank, uniqueness: Math.round(100 * (1 - highest)) };
	});
}

export function jaccard(a: Set<string>, b: Set<string>): number {
	if (!a.size && !b.size) return 1;
	let shared = 0;
	for (const token of a) if (b.has(token)) shared++;
	return shared / (a.size + b.size - shared);
}

/** MinHash signatures banded into buckets: sets sharing a bucket are likely similar. */
export class LshIndex {
	private readonly _buckets = new Map<string, number[]>();
	private readonly _keys: string[][];

	constructor(tokenSets: string[][]) {
		this._keys = tokenSets.map((tokens) => bandKeys(minHash(tokens)));
		this._keys.forEach((keys, i) => {
			for (const key of keys) {
				const bucket = this._buckets.get(key);
				if (bucket) bucket.push(i);
				else this._buckets.set(key, [i]);
			}
		});
	}

	neighbours(i: number): Set<number> {
		const found = new Set<number>();
		for (const key of this._keys[i]) for (const other of this._buckets.get(key) ?? []) if (other !== i) found.add(other);
		return found;
	}
}

const SEEDS = Array.from({ length: HASHES }, (_, i) => [hash32(`a${i}`) | 1, hash32(`b${i}`)] as const);

export function minHash(tokens: string[]): Uint32Array {
	const signature = new Uint32Array(HASHES).fill(0xffffffff);
	for (const token of tokens) {
		const h = hash32(token);
		for (let i = 0; i < HASHES; i++) {
			// murmur3 finaliser over the seeded hash: independent permutations per row
			let x = h ^ SEEDS[i][1];
			x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
			x = Math.imul(x ^ (x >>> 13), SEEDS[i][0]);
			x = (x ^ (x >>> 16)) >>> 0;
			if (x < signature[i]) signature[i] = x;
		}
	}
	return signature;
}

function bandKeys(signature: Uint32Array): string[] {
	const keys: string[] = [];
	for (let band = 0; band < BANDS; band++) {
		keys.push(`${band}:${Array.from(signature.subarray(band * ROWS, band * ROWS + ROWS)).join('.')}`);
	}
	return keys;
}

/** FNV-1a, 32-bit. */
export function hash32(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}
