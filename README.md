# Coder

A software architecture learning platform at [coder.webart.work](https://coder.webart.work).
Twelve focused lessons cover requirements, project structure, module boundaries, dependencies,
domain rules, data consistency, APIs, testing, reliability, delivery, observability and decision records.
Each lesson includes a real-project example, an exercise and an interactive practice scenario.

## Stack

Angular 22 with SSR prerender and Tailwind CSS. Public learning pages require no account and keep
answers only for the current page visit. Conventions come from
`@wawjs/ngx-default`; see `AGENTS.md`.

## Commands

```bash
npm start        # dev server
npm run build    # production build and prerender into dist/app/browser
npm run build:seo # build plus image, content integrity and prerendered metadata checks
```

## Deploy

GitHub Pages through `.github/workflows/deploy.yml`, with `CNAME` set to `coder.webart.work`.

## License

GPL-3.0-or-later.

Content lives in `src/data/architecture/lessons.json`. Generated brand sources, exact image prompts
and export instructions are in `tools/seo/brand/`. The previous chess implementation and inherited
Firebase configuration remain in source for reference; they are not used by the new public routes.
