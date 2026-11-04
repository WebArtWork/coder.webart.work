import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
	{
		// depend on the signed-in user, who only exists in the browser
		path: 'profile',
		renderMode: RenderMode.Client,
	},
	{
		path: 'systems',
		renderMode: RenderMode.Client,
	},
	{
		path: 'systems/:id',
		renderMode: RenderMode.Client,
	},
	{
		path: 'sign-in',
		renderMode: RenderMode.Client,
	},
	{ path: '**', renderMode: RenderMode.Prerender },
];
