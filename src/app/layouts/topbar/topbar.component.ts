import { NgOptimizedImage } from '@angular/common';
import { afterNextRender, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { IconComponent } from '../../components/icon/icon.component';
import { AuthService } from '../../feature/auth/auth.service';
import { TPipe } from '../../feature/i18n/t.pipe';
import { ProgressService } from '../../feature/progress/progress.service';
import { ShareService } from '../../feature/share/share.service';
import { NavStateService } from '../nav-state.service';
import { NAV_LINKS } from '../nav.const';

@Component({
	selector: 'app-topbar',
	imports: [IconComponent, NgOptimizedImage, RouterLink, TPipe],
	templateUrl: './topbar.component.html',
	// no box of its own, so the sticky header sticks to the page, not to this element
	host: { class: 'contents' },
})
export class TopbarComponent {
	private readonly _auth = inject(AuthService);
	private readonly _router = inject(Router);
	protected readonly nav = inject(NavStateService);

	protected readonly links = NAV_LINKS;
	protected readonly user = this._auth.user;
	protected readonly progress = inject(ProgressService);
	protected readonly sharing = inject(ShareService);

	/** The active route's data, deepest level winning: page name and Study link. */
	protected readonly route = toSignal(
		this._router.events.pipe(
			filter((event) => event instanceof NavigationEnd),
			startWith(null),
			map(() => _routeData(this._router.routerState.snapshot.root)),
		),
		{ initialValue: {} as TopbarData },
	);

	constructor() {
		// restores the Firebase session after first paint, so the profile button can show the photo
		afterNextRender(() => void this._auth.whenReady());
	}
}

interface TopbarData {
	pageName?: string;
}

function _routeData(route: ActivatedRouteSnapshot): TopbarData {
	let current: ActivatedRouteSnapshot | null = route;
	let data: TopbarData = {};
	while (current) {
		data = { ...data, ...(current.data as TopbarData) };
		current = current.firstChild;
	}
	return data;
}
