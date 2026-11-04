import { ENDGAME_PHASE } from '../chess/board.ts';
import type { Replay } from '../chess/replay.ts';

export type SignalKind =
	| 'mistake'
	| 'punish'
	| 'tactic'
	| 'sacrifice'
	| 'attack'
	| 'mate'
	| 'promotion'
	| 'endgame'
	| 'quiet';

/** A position (before move `ply`) that looks worth showing to the engine. */
export interface Signal {
	ply: number;
	kind: SignalKind;
	weight: number;
}

export interface Prescore {
	/** 0–100, engine-free estimate of how instructive the game is. */
	score: number;
	signals: Signal[];
	/** Ply after which the game was effectively decided, or null. */
	decidedAt: number | null;
}

const OPENING_PLIES = 10;
const EVAL_CLAMP = 1500;

/** Lichess win probability (0–100) for a centipawn score. */
export function winChance(cp: number): number {
	const clamped = Math.max(-EVAL_CLAMP, Math.min(EVAL_CLAMP, cp));
	return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/**
 * Finds turning points from Lichess evals when present, otherwise from material swings, checks,
 * sacrifices, promotions and the endgame transition. Cheap: no engine involved.
 */
export function prescore(game: Replay, evals: (number | null)[] | null, result: string): Prescore {
	const plies = game.plies;
	const n = plies.length;
	const signals: Signal[] = [];
	const add = (ply: number, kind: SignalKind, weight: number) => {
		if (ply >= OPENING_PLIES && ply < n) signals.push({ ply, kind, weight });
	};
	const materialBefore = (i: number) => (i <= 0 ? 0 : plies[i - 1].material);
	const moverSign = (i: number) => (plies[i].color === 'w' ? 1 : -1);

	let leadChanges = 0;
	let decidedAt: number | null = null;

	if (evals) {
		let lead = 0;
		for (let i = 0; i < n; i++) {
			const after = evals[i];
			const before = i === 0 ? 20 : evals[i - 1];
			if (after === null || before === null) continue;
			const sign = moverSign(i);
			const loss = winChance(sign * before) - winChance(sign * after);
			if (loss >= 10) {
				add(i, 'mistake', loss / 10);
				add(i + 1, 'punish', loss / 10);
			}
			const nextLead = after >= 150 ? 1 : after <= -150 ? -1 : 0;
			if (nextLead && lead && nextLead !== lead) leadChanges++;
			if (nextLead) lead = nextLead;
		}
		for (let i = n - 1; i >= 0; i--) {
			const value = evals[i];
			if (value === null || Math.abs(value) < 400) {
				decidedAt = i + 1 < n ? i + 1 : null;
				break;
			}
			if (i === 0) decidedAt = 0;
		}
	} else {
		for (let i = 0; i < n; i++) {
			const settled = settledMaterial(game, i);
			const delta = (settled - materialBefore(i)) * moverSign(i);
			if (delta <= -2) {
				add(i, 'mistake', 1 + Math.min(9, -delta) / 3);
				add(i + 1, 'punish', 1 + Math.min(9, -delta) / 3);
			} else if (delta >= 2 && (plies[i].captured || plies[i].check)) {
				add(i, 'tactic', 1 + Math.min(9, delta) / 3);
			}
		}
		for (let i = n - 1; i >= 0; i--) {
			if (Math.abs(plies[i].material) < 4) {
				decidedAt = i + 1 < n ? i + 1 : null;
				break;
			}
			if (i === 0) decidedAt = 0;
		}
	}

	// sacrifices: material given up for at least two plies, then won back or converted
	const winner = result === '1-0' ? 'w' : result === '0-1' ? 'b' : null;
	for (let i = 0; i + 2 < n; i++) {
		const sign = moverSign(i);
		const start = materialBefore(i);
		const down = Math.min(plies[i + 1].material - start, plies[i + 2].material - start) * sign;
		if (down > -2) continue;
		const later = plies[Math.min(n - 1, i + 10)].material - start;
		const recovered = later * sign >= -0.5;
		const evalHolds = evals ? evals[i] !== null && winChance(sign * (evals[i] as number)) >= 45 : false;
		const converted = winner === plies[i].color && n - i <= 30;
		if (recovered || evalHolds || converted) add(i, 'sacrifice', 3);
	}

	// attacks: three checks by the same side within four of its moves
	for (let i = 0; i < n; i++) {
		if (!plies[i].check) continue;
		let checks = 0;
		for (let j = i; j < Math.min(n, i + 8); j += 2) if (plies[j].check) checks++;
		const previous = i >= 2 && plies[i - 2].check;
		if (checks >= 3 && !previous) add(i, 'attack', 1.5);
	}

	// mating finish: walk back through the winner's forcing moves
	if (game.checkmate) {
		let start = n - 1;
		while (start - 2 >= 0 && n - 1 - (start - 2) <= 8 && (plies[start - 2].check || plies[start - 2].captured)) {
			start -= 2;
		}
		add(start, 'mate', n - start >= 3 ? 3 : 2);
	}

	for (let i = 0; i < n; i++) {
		if (plies[i].promotion) add(i - 4, 'promotion', 1);
	}

	// endgame: entering it with enough play left
	const endgameAt = plies.findIndex((ply) => ply.phase <= ENDGAME_PHASE);
	if (endgameAt >= 0 && n - endgameAt >= 16) {
		const balanced = Math.abs(plies[endgameAt].material) <= 1;
		add(endgameAt + 1, 'endgame', balanced ? 1.6 : 1.1);
		add(endgameAt + 9, 'endgame', balanced ? 1.3 : 0.9);
	}

	// quiet middlegame moments: material for candidate-move and positional exercises
	for (const target of [20, 28, 36, 44, 52]) {
		for (let i = target; i < Math.min(n, target + 6); i++) {
			const quiet = !plies[i].captured && !plies[i].check && (i === 0 || !plies[i - 1].captured);
			if (quiet && plies[i].phase > ENDGAME_PHASE) {
				add(i, 'quiet', 0.6);
				break;
			}
		}
	}

	return { score: scoreGame(signals, n, leadChanges, decidedAt, evals !== null, result), signals, decidedAt };
}

function scoreGame(
	signals: Signal[],
	plies: number,
	leadChanges: number,
	decidedAt: number | null,
	hasEvals: boolean,
	result: string,
): number {
	const strong = signals.filter((signal) => signal.kind !== 'quiet').sort((a, b) => b.weight - a.weight);
	let raw = strong.slice(0, 8).reduce((sum, signal) => sum + Math.min(4, signal.weight), 0);
	raw += new Set(strong.map((signal) => signal.kind)).size * 0.8;
	raw += Math.min(3, leadChanges) * 0.8;
	if (plies >= 60 && plies <= 160) raw += 1.5;
	else if (plies > 160) raw += 0.5;
	if (decidedAt !== null && decidedAt < 30) raw -= 3;
	if (result === '1/2-1/2' && plies < 60) raw -= 2;
	if (hasEvals) raw += 0.5;
	return Math.round(100 * (1 - Math.exp(-Math.max(0, raw) / 10)));
}

/** Material once the capture sequence starting at ply `i` is over (up to six plies later). */
function settledMaterial(game: Replay, i: number): number {
	const plies = game.plies;
	let k = i;
	while (k + 1 < plies.length && k - i < 5 && (plies[k].captured || plies[k + 1].captured)) k++;
	return plies[k].material;
}

/** Quiet moments always looked at, since they are where positions with several good moves come from (Good moves, Who is better?). */
const QUIET_SLOTS = 3;

/** Up to `count` signalled plies, strongest first, at least three plies apart, with room kept for quiet ones. */
export function pickSignalPlies(signals: Signal[], count: number): number[] {
	const rank = (list: Signal[]) => {
		const strongest = new Map<number, number>();
		for (const signal of list) strongest.set(signal.ply, (strongest.get(signal.ply) ?? 0) + signal.weight);
		return [...strongest.entries()].sort((a, b) => b[1] - a[1]).map(([ply]) => ply);
	};
	const picked: number[] = [];
	const take = (plies: number[], limit: number) => {
		for (const ply of plies) {
			if (picked.length >= limit) break;
			if (picked.every((other) => Math.abs(other - ply) >= 3)) picked.push(ply);
		}
	};
	const quiet = signals.filter((signal) => signal.kind === 'quiet');
	take(rank(signals.filter((signal) => signal.kind !== 'quiet')), Math.max(0, count - Math.min(QUIET_SLOTS, quiet.length)));
	take(rank(quiet), count);
	take(rank(signals), count);
	return picked.sort((a, b) => a - b);
}
