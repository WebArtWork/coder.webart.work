import type { Config, Speed } from '../config.ts';

/** Lichess speed from a `base+increment` time control (estimated game length = base + 40 × increment). */
export function speedOf(timeControl: string | undefined): Speed | null {
	if (!timeControl) return null;
	if (timeControl === '-') return 'correspondence';
	const match = /^(\d+)\+(\d+)$/.exec(timeControl);
	if (!match) return null;
	const seconds = Number(match[1]) + 40 * Number(match[2]);
	if (seconds < 30) return 'ultraBullet';
	if (seconds < 180) return 'bullet';
	if (seconds < 480) return 'blitz';
	if (seconds < 1500) return 'rapid';
	return 'classical';
}

export type HeaderFilterConfig = Pick<
	Config,
	'speeds' | 'terminations' | 'minRating' | 'maxRating' | 'maxRatingGap' | 'allowBots'
>;

/** Why a game is rejected on its headers alone, or null when it passes. */
export function rejectHeaders(headers: Record<string, string>, config: HeaderFilterConfig): string | null {
	if (headers['Variant'] && headers['Variant'] !== 'Standard') return 'variant';
	if (headers['FEN'] || headers['SetUp'] === '1') return 'setup';
	const speed = speedOf(headers['TimeControl']);
	if (!speed || !config.speeds.includes(speed)) return 'speed';
	if (!config.terminations.includes(headers['Termination'] ?? '')) return 'termination';
	if (!['1-0', '0-1', '1/2-1/2'].includes(headers['Result'] ?? '')) return 'result';
	if (!config.allowBots && (headers['WhiteTitle'] === 'BOT' || headers['BlackTitle'] === 'BOT')) return 'bot';
	const white = Number(headers['WhiteElo']);
	const black = Number(headers['BlackElo']);
	if (!Number.isFinite(white) || !Number.isFinite(black)) return 'rating';
	if (Math.min(white, black) < config.minRating || Math.max(white, black) > config.maxRating) return 'rating';
	if (Math.abs(white - black) > config.maxRatingGap) return 'rating';
	if (!/lichess\.org\/\w+/.test(headers['Site'] ?? '')) return 'site';
	return null;
}
