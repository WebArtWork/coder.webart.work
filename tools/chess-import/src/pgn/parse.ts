/** Mate scores are stored as centipawns past this bound; closer mates score higher. */
export const MATE_CP = 10000;

export interface Movetext {
	san: string[];
	/** Lichess `[%eval]` after each move, White's point of view, centipawns; null when the game has none. */
	evals: (number | null)[] | null;
	/** Result token at the end of the movetext, if any. */
	result: string | null;
}

export interface ParsedGame extends Movetext {
	headers: Record<string, string>;
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

/** Headers only: cheap enough to run on every game in the archive. */
export function parseHeaders(text: string): { headers: Record<string, string>; movetextAt: number } {
	const headers: Record<string, string> = {};
	let at = 0;
	while (at < text.length) {
		const end = text.indexOf('\n', at);
		const line = (end < 0 ? text.slice(at) : text.slice(at, end)).trim();
		if (line && !line.startsWith('[')) break;
		const match = /^\[(\w+)\s+"(.*)"\]$/.exec(line);
		if (match) headers[match[1]] = match[2].replace(/\\"/g, '"');
		if (end < 0) {
			at = text.length;
			break;
		}
		at = end + 1;
	}
	return { headers, movetextAt: at };
}

export function parseGame(text: string): ParsedGame {
	const { headers, movetextAt } = parseHeaders(text);
	return { headers, ...parseMovetext(text.slice(movetextAt)) };
}

/** SAN moves, evals and the result token from PGN movetext; comments, NAGs and variations are skipped. */
export function parseMovetext(movetext: string): Movetext {
	const san: string[] = [];
	const evals: (number | null)[] = [];
	let sawEval = false;
	let result: string | null = null;
	let variation = 0;
	const tokens = /\{([^}]*)\}|;[^\n]*|(\()|(\))|([^\s{}();]+)/g;
	let match: RegExpExecArray | null;
	while ((match = tokens.exec(movetext))) {
		if (match[2]) {
			variation++;
			continue;
		}
		if (match[3]) {
			variation = Math.max(0, variation - 1);
			continue;
		}
		if (variation) continue;
		if (match[1] !== undefined) {
			const evalMatch = /\[%eval\s+([^\],\s]+)/.exec(match[1]);
			if (evalMatch && san.length) {
				const value = parseEval(evalMatch[1]);
				if (value !== null) {
					evals[san.length - 1] = value;
					sawEval = true;
				}
			}
			continue;
		}
		let token = match[4];
		if (!token) continue;
		if (RESULTS.has(token)) {
			result = token;
			continue;
		}
		token = token.replace(/^\d+\.+/, '');
		if (!token || /^\$\d+$/.test(token) || /^[!?]+$/.test(token)) continue;
		san.push(token.replace(/[!?]+$/, ''));
	}
	if (!sawEval) return { san, evals: null, result };
	return { san, evals: san.map((_, i) => evals[i] ?? null), result };
}

/** Lichess `0.18` / `#-3`, White's point of view, to centipawns. */
export function parseEval(text: string): number | null {
	if (text.startsWith('#')) {
		const mate = Number(text.slice(1));
		if (!Number.isFinite(mate)) return null;
		return Math.sign(mate || 1) * (MATE_CP - Math.abs(mate));
	}
	const pawns = Number(text);
	return Number.isFinite(pawns) ? Math.round(pawns * 100) : null;
}
