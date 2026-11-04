import { Chess } from 'chess.js';
import { SavedGame } from '../chess/chess.interface';
import { STARTING_FEN } from '../chess/chess.util';
import { EngineService } from '../chess/engine.service';
import { OwnMistake } from './review.service';

/** Quick scan depth: enough to see a dropped piece or a missed tactic. */
const SCAN_GO = 'go depth 10';
/** Pawns a move must give up to count as a mistake. */
export const MISTAKE_LOSS = 1.5;
/** A position already this lost teaches little. */
const LOST = -3;
/** Plies looked at per game. */
const MAX_PLIES = 100;

/** A mistake found in a saved game, with the review queue id `<savedGameId>-<ply>`. */
export interface FoundMistake {
	id: string;
	mistake: OwnMistake;
}

/**
 * Finds the moves in saved games that gave up at least 1.5 pawns, by scoring every position with the
 * browser engine. `onProgress` gets positions done and total; `stopped` ends the scan early.
 */
export async function findMistakes(
	engine: EngineService,
	games: SavedGame[],
	onProgress: (done: number, total: number) => void,
	stopped: () => boolean,
): Promise<FoundMistake[]> {
	const positions = games.map((game) => ({ game, fens: replay(game) }));
	const total = positions.reduce((sum, { fens }) => sum + fens.length, 0);
	let done = 0;
	const found: FoundMistake[] = [];
	for (const { game, fens } of positions) {
		const scores: { eval: number; best: string; line: string[]; san: string }[] = [];
		for (const fen of fens) {
			if (stopped()) return found;
			const [top] = await engine.getTopMoves(fen, 1, SCAN_GO);
			scores.push(top ? { eval: top.rawEval, best: top.move, line: top.line.moves, san: top.san } : { eval: 0, best: '', line: [], san: '' });
			onProgress(++done, total);
		}
		const chess = new Chess(game.startFen || STARTING_FEN);
		for (let ply = 0; ply + 1 < fens.length; ply++) {
			const before = scores[ply];
			const after = scores[ply + 1];
			const sign = fens[ply].split(' ')[1] === 'w' ? 1 : -1;
			const loss = sign * before.eval - sign * after.eval;
			const move = chess.move(game.sans[ply]);
			// a mate has no engine score after it; it is never the mistake
			if (chess.isCheckmate() || loss < MISTAKE_LOSS || sign * before.eval < LOST || !before.best || move.lan === before.best) continue;
			found.push({
				id: `${game.id}-${ply}`,
				mistake: {
					fen: fens[ply],
					played: move.lan,
					playedSan: move.san,
					best: before.best,
					bestSan: before.san,
					line: before.line.slice(0, 8),
					eval: before.eval,
					loss: Math.round(loss * 10) / 10,
					title: game.title,
					moveNumber: Math.floor(ply / 2) + 1 + (game.startFen ? Number(game.startFen.split(' ')[5] ?? 1) - 1 : 0),
				},
			});
		}
	}
	return found;
}

/** Every position of a saved game, before each move, plus the last one. */
function replay(game: SavedGame): string[] {
	const chess = new Chess(game.startFen || STARTING_FEN);
	const fens = [chess.fen()];
	for (const san of game.sans.slice(0, MAX_PLIES)) {
		try {
			chess.move(san);
		} catch {
			break;
		}
		fens.push(chess.fen());
	}
	return fens;
}
