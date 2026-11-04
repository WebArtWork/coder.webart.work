import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { buildRouteMeta } from '@wawjs/ngx-default';
import { companyProfile } from './feature/company/company.data';
import { guestGuard } from './feature/auth/auth.guard';
import { CHALLENGES, loadChallenge } from './feature/challenges/challenges.data';
import { GlossaryService } from './feature/glossary/glossary.service';
import { loadQuestions } from './feature/practice/practice.data';
import { loadTopic, THEORY_TOPICS } from './feature/theory/theory.data';

const loadComponent = () =>
	import('./pages/architecture/architecture.component').then((m) => m.ArchitectureComponent);
const page = (path: string, mode: string, extra: Record<string, unknown> = {}) => ({
	mode,
	meta: buildRouteMeta(companyProfile, path),
	...extra,
});
const infoPage = (path: string, title: string, paragraphs: string[]) => ({
	path,
	loadComponent,
	data: page('/' + path, path, { info: { title, paragraphs } }),
});

export const routes: Routes = [
	{
		path: '',
		pathMatch: 'full',
		loadComponent,
		data: page('/', 'home', {
			meta: {
				...buildRouteMeta(companyProfile, '/'),
				title: companyProfile.title,
				titleSuffix: '',
			},
		}),
	},
	{
		path: 'theory',
		loadComponent: () => import('./pages/theory/theory.component').then((m) => m.TheoryComponent),
		data: page('/theory', 'theory'),
	},
	...THEORY_TOPICS.map(
		(topic): Routes[number] => ({
			path: 'theory/' + topic.slug,
			loadComponent: () =>
				import('./pages/theory-lesson/theory-lesson.component').then((m) => m.TheoryLessonComponent),
			resolve: { topic: () => loadTopic(topic.slug), glossary: () => inject(GlossaryService).load() },
			data: page('/theory/' + topic.slug, 'lesson'),
		}),
	),
	{
		path: 'practice',
		loadComponent: () => import('./pages/practice/practice.component').then((m) => m.PracticeComponent),
		data: page('/practice', 'practice'),
	},
	...THEORY_TOPICS.map(
		(topic): Routes[number] => ({
			path: 'practice/' + topic.slug,
			loadComponent: () => import('./pages/exercise/exercise.component').then((m) => m.ExerciseComponent),
			resolve: { set: () => loadQuestions(topic.slug), glossary: () => inject(GlossaryService).load() },
			data: page('/practice/' + topic.slug, 'exercise'),
		}),
	),
	...CHALLENGES.map(
		(card): Routes[number] => ({
			path: 'practice/challenge/' + card.slug,
			loadComponent: () => import('./pages/challenge/challenge.component').then((m) => m.ChallengeComponent),
			resolve: { challenge: () => loadChallenge(card.slug), glossary: () => inject(GlossaryService).load() },
			data: page('/practice/challenge/' + card.slug, 'challenge'),
		}),
	),
	{
		path: 'glossary',
		loadComponent: () => import('./pages/glossary/glossary.component').then((m) => m.GlossaryComponent),
		data: page('/glossary', 'glossary'),
	},
	infoPage('privacy', 'Privacy', [
		'The lessons and exercises are available without an account. Coder signs you in as a guest so that your results can be saved. Your answers are checked in your browser; only your best result for each lesson is stored.',
		'The hosting provider may process request information to deliver the site. Your best result for each lesson is stored in your browser and in Firebase (Google), under your guest or Google account. If you sign in with Google, Coder also stores the name, email and photo of that account. Your chosen language and theme stay in your browser. You can delete your data and your account on the profile page.',
	]),
	infoPage('licenses', 'Licenses and credits', [
		'This project is licensed under GPL-3.0-or-later. Third-party software retains its own license terms. The distribution includes third-party license notices.',
		'The Coder brand mark and modular architecture artwork were generated for this project using OpenAI image generation. The lessons and exercises are original learning material; the further reading links point to the sources of each topic.',
	]),
	{
		path: 'systems',
		loadComponent: () => import('./pages/systems/systems.component').then((m) => m.SystemsComponent),
		data: { meta: { title: 'Systems', robots: 'noindex, nofollow' } },
	},
	{
		path: 'systems/:id',
		loadComponent: () => import('./pages/system/system.component').then((m) => m.SystemComponent),
		data: { meta: { title: 'System', robots: 'noindex, nofollow' } },
	},
	{
		path: 'sign-in',
		canActivate: [guestGuard],
		loadComponent: () => import('./pages/sign-in/sign-in.component').then((m) => m.SignInComponent),
		data: { meta: { title: 'Sign in', robots: 'noindex, nofollow' } },
	},
	{
		path: 'profile',
		loadComponent: () => import('./pages/profile/profile.component').then((m) => m.ProfileComponent),
		data: { meta: { title: 'Profile', robots: 'noindex, nofollow' } },
	},
	{ path: 'dashboard', redirectTo: '', pathMatch: 'full' },
	{
		path: '**',
		loadComponent,
		data: {
			mode: 'not-found',
			meta: { title: 'Page not found', robots: 'noindex, follow' },
			info: {
				title: 'This learning page has moved',
				paragraphs: [
					'Explore the lessons and practice exercises to find the topic you are looking for.',
				],
			},
		},
	},
];
