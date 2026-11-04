import { NgOptimizedImage } from '@angular/common';
import { afterNextRender, Component, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { buildCanonicalUrl, CanonicalService } from '@wawjs/ngx-default';
import { filter, map, startWith } from 'rxjs';
import { FiltersService } from './feature/filters/filters.service';
import { IconComponent } from './components/icon/icon.component';
import { IconName } from './components/icon/icon.data';
import { companyProfile } from './feature/company/company.data';
import { AuthService } from './feature/auth/auth.service';
import { ReadingProgressService } from './feature/reading/reading-progress.service';
import { PracticeProgressService } from './feature/practice/practice-progress.service';
import { TPipe } from './feature/i18n/t.pipe';

/** The first part of the address to the name of the page, in English; the template translates it. */
const PAGE_NAMES: Record<string, string> = {
	glossary: 'Glossary',
	theory: 'Learn',
	practice: 'Practice',
	systems: 'Systems',
	profile: 'Profile',
	'sign-in': 'Sign in',
	privacy: 'Privacy',
	licenses: 'Credits',
};

@Component({
	selector: 'app-root',
	imports: [IconComponent, RouterOutlet, RouterLink, RouterLinkActive, NgOptimizedImage, TPipe],
	template: `
		<div class="min-h-dvh bg-bg text-fg">
			<a
				class="sr-only-focusable fixed left-4 top-4 z-50 rounded-lg bg-brand p-3 text-brand-fg"
				href="#main"
				>Skip to content</a
			>
			<header class="border-b border-line">
				<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8 md:py-4">
					<div class="flex min-w-0 items-center gap-3">
						<a
							class="flex shrink-0 items-center gap-3 text-xl font-semibold tracking-tight"
							routerLink="/"
							aria-label="Coder home"
						>
							<img ngSrc="/logo.png" width="40" height="40" priority alt="" /><span class="max-md:hidden">Coder</span>
						</a>
						<!-- on phones the page name takes the place of the menu, which sits in the bottom bar -->
						<span class="truncate text-base font-semibold tracking-tight md:hidden">{{ pageName() | t }}</span>
					</div>
					<nav class="hidden gap-5 text-sm md:flex" aria-label="Main navigation">
						@for (link of links; track link.path) {
							<a [routerLink]="link.path" routerLinkActive="text-brand" ariaCurrentWhenActive="page">{{ link.label | t }}</a>
						}
					</nav>
					<div class="flex shrink-0 items-center gap-2">
					@if (filters.page(); as page) {
						<button
							class="relative flex size-10 items-center justify-center rounded-full border border-line md:hidden"
							type="button"
							aria-haspopup="dialog"
							[attr.aria-label]="'Filters' | t"
							[attr.title]="'Filters' | t"
							(click)="filters.open()"
						>
							<app-icon name="filter" />
							@if (page.active()) {
								<span class="absolute right-1 top-1 size-2.5 rounded-full bg-brand" aria-hidden="true"></span>
							}
						</button>
					}
					<a
						class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line text-sm font-semibold"
						routerLink="/profile"
						routerLinkActive="border-brand text-brand"
						[attr.aria-label]="'Profile' | t"
						[attr.title]="'Profile' | t"
					>
						@if (user()?.photoURL; as photo) {
							<img class="size-full object-cover" [src]="photo" alt="" referrerpolicy="no-referrer" width="40" height="40" />
						} @else {
							<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="12" cy="8" r="4" />
								<path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
							</svg>
						}
					</a>
					</div>
				</div>
			</header>
			<main id="main" tabindex="-1" class="mx-auto min-h-[75dvh] max-w-6xl px-5 sm:px-8">
				<router-outlet />
			</main>
			<footer class="border-t border-line max-md:mb-14">
				<div
					class="mx-auto flex max-w-6xl flex-wrap justify-between gap-5 px-5 py-8 text-sm text-mute sm:px-8"
				>
					<p>Coder · Build with understanding.</p>
					<nav class="flex gap-5" aria-label="Footer">
						<a routerLink="/privacy">{{ 'Privacy' | t }}</a
						><a routerLink="/licenses">{{ 'Credits' | t }}</a
						>
					</nav>
				</div>
			</footer>
			<!-- the menu of the phone, as a bar at the bottom of the screen -->
			<nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Main navigation">
				<ul class="mx-auto grid max-w-md grid-cols-4">
					@for (link of links; track link.path) {
						<li>
							<a
								class="flex h-14 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs font-medium text-mute no-underline aria-[current=page]:text-brand!"
								[routerLink]="link.path"
								ariaCurrentWhenActive="page"
								routerLinkActive
							>
								<app-icon [name]="link.icon" />
								<!-- on a very narrow phone the name does not fit, so only the icon shows -->
								<span class="max-[339px]:sr-only">{{ link.label | t }}</span>
							</a>
						</li>
					}
				</ul>
			</nav>
		</div>
	`,
})
export class App {
	private readonly _auth = inject(AuthService);
	private readonly _router = inject(Router);
	protected readonly filters = inject(FiltersService);
	protected readonly user = this._auth.user;

	protected readonly links: { path: string; label: string; icon: IconName }[] = [
		{ path: '/glossary', label: 'Glossary', icon: 'glossary' },
		{ path: '/theory', label: 'Learn', icon: 'study' },
		{ path: '/practice', label: 'Practice', icon: 'play' },
		{ path: '/systems', label: 'Systems', icon: 'systems' },
	];

	/** The name of the current page, for the top bar of the phone. */
	protected readonly pageName = toSignal(
		this._router.events.pipe(
			filter((event) => event instanceof NavigationEnd),
			startWith(null),
			map(() => PAGE_NAMES[this._router.url.split(/[?#/]/).filter(Boolean)[0] ?? ''] ?? 'Coder'),
		),
		{ initialValue: 'Coder' },
	);

	constructor() {
		// everyone is signed in as a guest after the first paint, and the saved results follow the user
		inject(PracticeProgressService);
		inject(ReadingProgressService);
		afterNextRender(() => void this._auth.whenReady());
		inject(CanonicalService).initialize();
		const meta = inject(Meta);
		const router = inject(Router);
		const update = (url: string) =>
			meta.updateTag({
				property: 'og:url',
				content: buildCanonicalUrl(companyProfile.siteUrl, url),
			});
		update(router.url);
		router.events
			.pipe(
				filter((event) => event instanceof NavigationEnd),
				takeUntilDestroyed(),
			)
			.subscribe((event) => update(event.urlAfterRedirects));
	}
}
