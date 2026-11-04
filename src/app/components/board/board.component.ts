import {
	afterNextRender,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import type { Api } from '@lichess-org/chessground/api';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { Chess, type Square } from 'chess.js';
import { Side } from '../../feature/chess/chess.interface';
import { TPipe } from '../../feature/i18n/t.pipe';

export type Promotion = 'q' | 'r' | 'b' | 'n';

export interface BoardMove {
	from: string;
	to: string;
	/** Set only when a pawn promotes. */
	promotion?: Promotion;
}

export interface BoardArrow {
	from: string;
	to: string;
	brush: 'green' | 'blue' | 'red' | 'yellow';
}

/** A square marked on the board: picked by the player, right, wrong, or an answer shown afterwards. */
export type SquareMark = 'pick' | 'ok' | 'miss' | 'answer';

const PROMOTION_PIECES: { value: Promotion; role: string; label: string }[] = [
	{ value: 'q', role: 'queen', label: 'Promote to queen' },
	{ value: 'n', role: 'knight', label: 'Promote to knight' },
	{ value: 'r', role: 'rook', label: 'Promote to rook' },
	{ value: 'b', role: 'bishop', label: 'Promote to bishop' },
];

/** A `<piece>` element, so the chessground piece set styles it like a board piece. */
@Component({
	// eslint-disable-next-line @angular-eslint/component-selector
	selector: 'piece',
	template: '',
})
class BoardPieceComponent {}

/** Chessground wrapper. The parent owns the position; the board only reports moves. */
@Component({
	selector: 'app-board',
	imports: [BoardPieceComponent, TPipe],
	template: `
		<div class="relative aspect-square w-full overflow-hidden sm:rounded-xl">
			<div #host class="size-full"></div>
			@if (pending(); as move) {
				<div
					class="absolute inset-0 z-10 bg-black/50"
					role="dialog"
					[attr.aria-label]="'Choose promotion piece' | t"
					tabindex="-1"
					(click)="cancelPromotion()"
					(keydown.escape)="cancelPromotion()"
				>
					<div class="cg-wrap size-full">
						@for (choice of promotionChoices(); track choice.value) {
							<button
								type="button"
								class="absolute size-[12.5%] rounded-full bg-white/80 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
								[style.left.%]="choice.left"
								[style.top.%]="choice.top"
								[attr.aria-label]="choice.label | t"
								(click)="$event.stopPropagation(); promote(choice.value)"
							>
								<piece class="{{ choice.role }} {{ choice.color }}" style="width: 100%; height: 100%"></piece>
							</button>
						}
					</div>
				</div>
			}
		</div>
	`,
})
export class BoardComponent {
	readonly fen = input.required<string>();
	readonly orientation = input<Side>('white');
	readonly interactive = input(true);
	readonly viewOnly = input(false);
	readonly arrows = input<BoardArrow[]>([]);
	readonly lastMove = input<BoardMove | null>(null);
	/** Squares to colour, e.g. the ones tapped in Spot the feature. */
	readonly marks = input<Record<string, SquareMark>>({});
	/** Squares are tapped instead of pieces moved; each tap is reported by `tapped`. */
	readonly tapMode = input(false);
	readonly moved = output<BoardMove>();
	readonly tapped = output<string>();

	/** A pawn move waiting for the promotion piece. */
	protected readonly pending = signal<BoardMove | null>(null);

	private readonly _host = viewChild.required<ElementRef<HTMLElement>>('host');
	private _api?: Api;

	private readonly _legal = computed(() => {
		const dests = new Map<Key, Key[]>();
		const promotions = new Set<string>();
		if (!this.interactive()) return { dests, promotions };
		try {
			const game = new Chess(this.fen());
			for (const move of game.moves({ verbose: true })) {
				const list = dests.get(move.from as Key) ?? [];
				if (!list.includes(move.to as Key)) list.push(move.to as Key);
				dests.set(move.from as Key, list);
				if (move.promotion) promotions.add(move.from + move.to);
			}
		} catch {
			/* invalid fen: no moves */
		}
		return { dests, promotions };
	});

	/** Picker squares: a column on the promotion file, starting at the promotion rank. */
	protected readonly promotionChoices = computed(() => {
		const move = this.pending();
		if (!move) return [];
		const color = this.fen().includes(' b ') ? 'black' : 'white';
		const flipped = this.orientation() === 'black';
		const file = move.to.charCodeAt(0) - 97;
		const rank = Number(move.to[1]);
		const col = flipped ? 7 - file : file;
		const row = flipped ? rank - 1 : 8 - rank;
		const step = row === 0 ? 1 : -1;
		return PROMOTION_PIECES.map((piece, i) => ({
			...piece,
			color,
			left: col * 12.5,
			top: (row + step * i) * 12.5,
		}));
	});

	constructor() {
		const destroyRef = inject(DestroyRef);

		afterNextRender(async () => {
			const { Chessground } = await import('@lichess-org/chessground');
			if (destroyRef.destroyed) return;
			this._api = Chessground(this._host().nativeElement, {
				...this._config(),
				events: {
					select: (key) => {
						if (this.tapMode()) this.tapped.emit(key);
					},
					move: (from, to) => {
						if (this._legal().promotions.has(from + to)) {
							// keep the pawn on the last rank until a piece is picked
							this.pending.set({ from, to });
							return;
						}
						this.moved.emit({ from, to });
						// snap back; the parent re-renders with a new fen if the move was applied
						this._api?.set(this._config());
					},
				},
			});
			destroyRef.onDestroy(() => this._api?.destroy());
		});

		effect(() => {
			const config = this._config();
			this._api?.set(config);
		});
	}

	protected promote(promotion: Promotion) {
		const move = this.pending();
		if (!move) return;
		this.pending.set(null);
		this.moved.emit({ ...move, promotion });
		this._api?.set(this._config());
	}

	protected cancelPromotion() {
		this.pending.set(null);
		this._api?.set(this._config());
	}

	/** Board placement with the promoting pawn already on its last-rank square. */
	private _withPawnOn(move: BoardMove): string {
		const game = new Chess(this.fen());
		const pawn = game.remove(move.from as Square);
		game.remove(move.to as Square);
		if (pawn) game.put(pawn, move.to as Square);
		return game.fen().split(' ')[0];
	}

	private _config(): Config {
		const turn: Side = this.fen().includes(' b ') ? 'black' : 'white';
		const pending = this.pending();
		const move = pending ?? this.lastMove();
		const tap = this.tapMode();
		const interactive = this.interactive() && !pending && !tap;
		return {
			fen: pending ? this._withPawnOn(pending) : this.fen().split(' ')[0],
			orientation: this.orientation(),
			turnColor: turn,
			lastMove: move ? ([move.from, move.to] as Key[]) : undefined,
			coordinates: !this.viewOnly(),
			viewOnly: this.viewOnly(),
			animation: { enabled: true, duration: 150 },
			highlight: {
				lastMove: true,
				check: true,
				custom: new Map(Object.entries(this.marks()).map(([square, mark]) => [square as Key, `mark-${mark}`])),
			},
			movable: {
				free: false,
				color: interactive ? turn : undefined,
				dests: this._legal().dests,
				showDests: true,
			},
			draggable: { enabled: this.interactive() && !tap },
			selectable: { enabled: this.interactive() || tap },
			drawable: {
				// right-click marks squares, right-drag draws arrows (shift/alt/ctrl change colour)
				enabled: true,
				autoShapes: this.arrows().map((arrow) => ({
					orig: arrow.from as Key,
					dest: arrow.to as Key,
					brush: arrow.brush,
				})),
			},
		};
	}
}
