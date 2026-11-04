import { describe, expect, it } from 'vitest';
import { openingFamily } from '../src/similarity/features.ts';
import { LshIndex, jaccard, selectDiverse, type Selectable } from '../src/similarity/select.ts';

const mix = { beginner: 0.15, intermediate: 0.45, advanced: 0.3, expert: 0.1 };

function game(id: string, tokens: string[], quality = 70, fens: string[] = [`fen-${id}`]): Selectable {
	return { id, quality, difficulty: 'intermediate', tokens, fens };
}

const ideasA = ['eco:B2', 'opening:sicilian defense', 'cat:tactics', 'motif:fork', 'struct:iqp', 'imb:equal', 'pawns:abc.ef.h/ab.def.h'];
const ideasB = ['eco:B2', 'opening:sicilian defense', 'cat:endgame', 'end:rook', 'struct:passed', 'imb:pawns1', 'pawns:a....f.h/.....fgh'];
const ideasC = ['eco:D3', 'opening:queens gambit', 'cat:defense', 'motif:perpetualCheck', 'struct:symmetric', 'imb:bnvr', 'pawns:ab..efgh/ab..efgh'];

describe('duplicates and uniqueness', () => {
	it('never selects two games sharing an exact training position', () => {
		const selected = selectDiverse(
			[game('a', ideasA, 90, ['same-fen']), game('b', ideasC, 80, ['same-fen']), game('c', ideasB, 70)],
			{ target: 10, minQuality: 0, minUniqueness: 0, mix },
		);
		expect(selected.map((item) => item.id).sort()).toEqual(['a', 'c']);
	});

	it('drops near-duplicates below the uniqueness threshold', () => {
		const nearCopy = [...ideasA.slice(0, -1), 'pawns:abc.ef.h/ab.d.fgh'];
		const selected = selectDiverse([game('a', ideasA, 90), game('a2', nearCopy, 85), game('c', ideasC, 60)], {
			target: 10,
			minQuality: 0,
			minUniqueness: 40,
			mix,
		});
		expect(selected.map((item) => item.id)).toEqual(['a', 'c']);
	});

	it('keeps games that share an opening but teach different ideas', () => {
		expect(jaccard(new Set(ideasA), new Set(ideasB))).toBeLessThan(0.3);
		const selected = selectDiverse([game('a', ideasA), game('b', ideasB)], { target: 10, minQuality: 0, minUniqueness: 50, mix });
		expect(selected).toHaveLength(2);
		expect(selected.every((item) => item.uniqueness >= 50 && item.uniqueness <= 100)).toBe(true);
	});

	it('does not pad the selection with games below the quality bar', () => {
		const selected = selectDiverse([game('a', ideasA, 80), game('b', ideasB, 20)], { target: 10, minQuality: 45, minUniqueness: 0, mix });
		expect(selected.map((item) => item.id)).toEqual(['a']);
	});

	it('balances difficulty levels towards the wanted mix', () => {
		const items: Selectable[] = [];
		for (let i = 0; i < 40; i++) {
			const tokens = [`unique:${i}`, `other:${i}`, `third:${i}`];
			items.push({ ...game(`e${i}`, tokens, 80), difficulty: 'expert' });
			items.push({ ...game(`i${i}`, [...tokens.map((t) => `${t}-i`)], 70), difficulty: 'intermediate' });
		}
		const selected = selectDiverse(items, { target: 20, minQuality: 0, minUniqueness: 0, mix });
		const intermediate = selected.filter((item) => item.id.startsWith('i')).length;
		expect(intermediate).toBeGreaterThan(10);
	});

	it('LSH finds near-identical token sets as neighbours', () => {
		const index = new LshIndex([ideasA, [...ideasA, 'phase:middlegame'], ideasC]);
		expect(index.neighbours(0).has(1)).toBe(true);
		expect(index.neighbours(0).has(2)).toBe(false);
	});

	it('reduces opening names to their family', () => {
		expect(openingFamily('Sicilian Defense: Najdorf Variation, English Attack')).toBe('sicilian defense');
		expect(openingFamily('?')).toBeNull();
	});
});
