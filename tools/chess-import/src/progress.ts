/** Tests run whole imports; their output would bury the test report. */
const quiet = Boolean(process.env['VITEST']);

/** One status line, redrawn in place on a terminal and printed every 15 s otherwise. */
export class Progress {
	private readonly _render: () => string;
	private readonly _timer: NodeJS.Timeout;
	private readonly _tty = Boolean(process.stderr.isTTY);
	private _lastPrint = 0;

	constructor(render: () => string) {
		this._render = render;
		this._timer = setInterval(() => this.tick(), 1000);
		this._timer.unref();
	}

	tick(): void {
		if (quiet) return;
		const line = this._render();
		if (this._tty) {
			process.stderr.write(`\r\x1b[2K${line}`);
		} else if (Date.now() - this._lastPrint >= 15_000) {
			process.stderr.write(`${line}\n`);
			this._lastPrint = Date.now();
		}
	}

	done(): void {
		clearInterval(this._timer);
		if (quiet) return;
		const line = this._render();
		process.stderr.write(this._tty ? `\r\x1b[2K${line}\n` : `${line}\n`);
	}
}

export function eta(done: number, total: number, startedAt: number): string {
	if (!done || done >= total) return '';
	const seconds = ((Date.now() - startedAt) / 1000 / done) * (total - done);
	return `, ~${duration(seconds)} left`;
}

export function duration(seconds: number): string {
	if (seconds < 90) return `${Math.round(seconds)}s`;
	if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
	return `${(seconds / 3600).toFixed(1)}h`;
}

export function log(message: string): void {
	if (!quiet) process.stderr.write(`${message}\n`);
}

export function bytes(count: number): string {
	return count >= 1e9 ? `${(count / 1e9).toFixed(2)} GB` : `${Math.round(count / 1e6)} MB`;
}
