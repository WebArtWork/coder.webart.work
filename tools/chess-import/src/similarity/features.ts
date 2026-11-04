import { Chess } from 'chess.js';
import { endgameType, materialTokens, phase, piecesOf, structureTokens } from '../chess/board.ts';

export interface TokenPosition {
	fen: string;
	category: string;
	motifs: string[];
}

/**
 * What a game teaches, as a token set: opening family, pawn structures, material balance,
 * endgame types, motifs and categories of its training positions. The opening is only a few
 * tokens among many, so games sharing an opening still differ when their ideas do.
 */
export function similarityTokens(headers: Record<string, string | null | undefined>, positions: TokenPosition[]): string[] {
	const tokens = new Set<string>();
	const eco = headers['ECO'];
	if (eco && eco !== '?') tokens.add(`eco:${eco.slice(0, 2)}`);
	const family = openingFamily(headers['Opening'] ?? undefined);
	if (family) tokens.add(`opening:${family}`);
	for (const position of positions) {
		const pieces = piecesOf(new Chess(position.fen));
		const stage = phase(pieces) <= 20 ? 'endgame' : phase(pieces) >= 50 ? 'opening' : 'middlegame';
		tokens.add(`phase:${stage}`);
		tokens.add(`cat:${position.category}`);
		tokens.add(`cat:${position.category}:${stage}`);
		for (const motif of position.motifs) if (!motif.startsWith('mateIn')) tokens.add(`motif:${motif}`);
		for (const token of structureTokens(pieces)) tokens.add(token);
		for (const token of materialTokens(pieces)) tokens.add(token);
		const ending = endgameType(pieces);
		if (ending) tokens.add(`end:${ending}`);
	}
	return [...tokens].sort();
}

/** "Sicilian Defense: Najdorf Variation, English Attack" → "sicilian defense". */
export function openingFamily(opening: string | undefined): string | null {
	if (!opening || opening === '?') return null;
	return opening.split(/[:,]/)[0].trim().toLowerCase();
}
