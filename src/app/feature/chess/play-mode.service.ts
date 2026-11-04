import { Service, signal } from '@angular/core';

export type PlayMode = 'daily' | 'random';

/** Shares Play state with the topbar. */
@Service()
export class PlayModeService {
	/** Which Play URL is showing (/daily or /random), so the topbar chips can mark it. */
	readonly mode = signal<PlayMode>('daily');

	/** FEN of the position on the board, for the topbar "Study" icon; null while none is shown. */
	readonly fen = signal<string | null>(null);
}
