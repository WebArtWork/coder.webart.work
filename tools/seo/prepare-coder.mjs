import { readdir, readFile, writeFile } from 'node:fs/promises';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, '\t')}\n`);
const company = await readJson('src/data/company/company.json');
const theory = await readJson('src/data/theory/catalog.json');
const challenges = (await readJson('src/data/challenges/index.json')).challenges;
const generation = await readJson('tools/seo/brand/generation-prompts.json');
const pages = {
	'/': { title: company.title, description: company.description, image: '/seo/dashboard.jpg' },
	'/theory': {
		title: 'Senior developer knowledge base: 120 lessons',
		description:
			'120 engineering lessons in 12 modules, in English and Ukrainian: programming principles, architecture, design patterns, algorithms, distributed systems, databases, APIs, security, testing, DevOps, engineering decisions and AI-driven engineering.',
		image: '/seo/theory.jpg',
	},
	'/practice': {
		title: 'Practice: 120 exercise sets for developers',
		description:
			'1,800 exercises in English and Ukrainian: for every lesson, 10 checked questions and 5 written tasks on principles, architecture, patterns, data, security, testing, reliability and AI-driven engineering.',
		image: '/seo/practice.jpg',
	},
};
// the lessons and their exercises share the cover of their hub page
for (const challenge of challenges) {
	const body = await readJson(`src/data/challenges/items/${challenge.slug}.json`);
	pages[`/practice/challenge/${challenge.slug}`] = {
		title: `${challenge.title.en}: system design challenge`,
		description: `${challenge.type[0].toUpperCase()}${challenge.type.slice(1)} challenge, ${challenge.level.en.toLowerCase()}, ${challenge.minutes} min. ${body.scenario.en.split(/(?<=[.!?])\s/)[0]}`,
		image: '/seo/practice.jpg',
	};
}
pages['/glossary'] = {
	title: 'Developer glossary: 354 terms',
	description:
		'354 software development terms in 15 categories, explained in everyday language in English and Ukrainian: code, web, data, Git, architecture, testing, security, cloud and AI-assisted development.',
	image: '/seo/theory.jpg',
};
for (const topic of theory.topics)
	pages[`/theory/${topic.slug}`] = {
		title: topic.title.en,
		description: topic.summary.en,
		image: '/seo/theory.jpg',
	};
for (const topic of theory.topics)
	pages[`/practice/${topic.slug}`] = {
		title: `${topic.title.en}: exercises`,
		description: `15 exercises on ${topic.title.en}: 10 questions that are checked for you and 5 written tasks. ${topic.summary.en}`,
		image: '/seo/practice.jpg',
	};
for (const [slug, title, description] of [
	[
		'privacy',
		'Privacy',
		'How Coder handles practice answers and browsing data. Learn software architecture without an account.',
	],
	[
		'licenses',
		'Licenses and credits',
		'Software licensing and credits for the Coder architecture learning platform.',
	],
])
	pages[`/${slug}`] = { title, description, image: `/seo/${slug}.jpg` };
company.pageSeo = pages;
await writeJson('src/data/company/company.json', company);

const oldFiles = (await readdir('src/assets/seo')).filter((file) => file.endsWith('.jpg'));
const files = [
	...new Set([...oldFiles, ...Object.values(pages).map((page) => page.image.split('/').pop())]),
].sort();
const wrap = (title) => {
	const lines = [''];
	for (const word of title.split(' ')) {
		if ((lines.at(-1) + ' ' + word).trim().length > 19) lines.push(word);
		else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim();
	}
	return lines;
};
const entries = files.map((file, index) => {
	const route = Object.keys(pages).find((key) => pages[key].image === `/seo/${file}`) ?? null;
	const category = file.startsWith('theory')
		? 'Lessons'
		: file.startsWith('practice')
			? 'Practice'
			: 'Developer learning';
	const title =
		route === '/'
			? 'Architect better software.'
			: route
				? pages[route].title.replace(': practice', '')
				: 'Build with understanding.';
	return {
		file: `src/assets/seo/${file}`,
		route,
		category,
		lines: wrap(title),
		edition: index + 1,
		mode: 'built-in image_gen master artwork + deterministic typography',
		source: 'tools/seo/brand/architecture-source.png',
		prompt: generation.artwork,
		composition:
			'1200x630 JPEG, generated artwork, generated Coder mark, section label, title, tagline, domain and edition; Segoe UI typography. Retired filenames retain generic Coder branding and are absent from the route catalog.',
	};
});
await writeJson('tools/seo/image-prompts.json', entries);
console.log(
	`Prepared ${Object.keys(pages).length} architecture routes and ${entries.length} covers.`,
);
