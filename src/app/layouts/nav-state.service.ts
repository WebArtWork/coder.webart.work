import { inject, Service } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { NavLink } from './nav.const';

/** Tells the topbar and the bottom bar which navigation link is current. */
@Service()
export class NavStateService {
	private readonly _router = inject(Router);

	private readonly _url = toSignal(
		this._router.events.pipe(
			filter((event) => event instanceof NavigationEnd),
			startWith(null),
			map(() => this._router.url.split(/[?#]/)[0]),
		),
		{ initialValue: '' },
	);

	isActive(link: NavLink): boolean {
		const url = this._url();
		return (link.matches ?? [link.path]).some((prefix) => url === prefix || url.startsWith(prefix + '/'));
	}
}
