import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builtDir = process.env.SEO_BUILD_DIR || 'dist/app/browser';
const read = (file) => readFile(path.join(root, file), 'utf8');
const company = JSON.parse(await read('src/data/company/company.json'));
const prompts = JSON.parse(await read('tools/seo/image-prompts.json'));
const theory = JSON.parse(await read('src/data/theory/catalog.json'));
const theoryRoutes = new Set(theory.topics.map((topic) => `/theories/${topic.slug}`));
const practiceRoutes = new Set(theory.topics.map((topic) => `/practices/${topic.slug}`));
const challenges = JSON.parse(await read('src/data/challenges/index.json')).challenges;
for (const challenge of challenges) practiceRoutes.add(`/practices/challenge/${challenge.slug}`);
const expectedRoutes = new Set([
	'/',
	'/theories',
	'/practices',
	'/glossary',
	'/privacy',
	'/licenses',
	...theoryRoutes,
	...practiceRoutes,
]);
assert.deepEqual(
	new Set(Object.keys(company.pageSeo)),
	expectedRoutes,
	'SEO catalog must match the public architecture routes',
);
assert.ok(
	!/chess|puzzle|tactics/i.test(JSON.stringify(company)),
	'Company metadata must use Coder architecture branding',
);
assert.equal(
	new Set(theory.topics.map((topic) => topic.slug)).size,
	120,
	'Lesson slugs must be unique',
);
for (const topic of theory.topics) {
	for (const dir of ['topics', 'practice', 'practice/keys']) {
		await stat(
			path.join(
				root,
				`src/data/theory/${dir === 'topics' ? 'topics' : '../' + dir}/${topic.slug}.json`,
			),
		);
	}
}
const errors = [];
const images = new Set();
const imageRoutes = new Map();

for (const route of expectedRoutes) {
	try {
		const seo = company.pageSeo[route];
		assert.ok(seo?.image, `${route}: missing page SEO image`);
		const url = new URL(seo.image, company.siteUrl);
		assert.equal(url.origin, new URL(company.siteUrl).origin, `${route}: image must be local`);
		const file = `src/assets${url.pathname}`;
		// the lessons and exercises share the cover of their hub page; every other route has its own
		if (!theoryRoutes.has(route) && !practiceRoutes.has(route) && route !== '/glossary') {
			assert.ok(
				!imageRoutes.has(file),
				`${route}: shares its cover with ${imageRoutes.get(file)}`,
			);
			imageRoutes.set(file, route);
		}
		assert.ok(
			prompts.some((entry) => entry.file === file),
			`${route}: missing image provenance`,
		);
		const bytes = await readFile(path.join(root, file));
		assert.ok(bytes.length > 1000, `${route}: empty or invalid image`);
		assert.ok(bytes.length <= 300_000, `${route}: social image exceeds 300 kB`);
		const [width, height] = jpegDimensions(bytes);
		assert.equal(width, 1200, `${route}: image width`);
		assert.equal(height, 630, `${route}: image height`);
		images.add(file);
		if (process.argv.includes('--built')) {
			await stat(path.join(root, builtDir, url.pathname));
			if (!route.includes(':') && !seo.robots?.includes('noindex')) {
				const html = await read(`${builtDir}${route === '/' ? '' : route}/index.html`);
				assert.ok(
					!/class="splash(?:\s|")/.test(html),
					`${route}: prerendered loading overlay blocks static content`,
				);
				for (const key of ['og:image:alt', 'twitter:image:alt']) {
					const tags = html.match(/<meta\b[^>]*>/g) ?? [];
					assert.ok(
						tags.some(
							(tag) => tag.includes(`="${key}"`) && /content="[^"]+"/.test(tag),
						),
						`${route}: missing ${key}`,
					);
				}
				for (const key of ['og:image', 'twitter:image']) {
					const tags = html.match(/<meta\b[^>]*>/g) ?? [];
					assert.ok(
						tags.some(
							(tag) =>
								tag.includes(`="${key}"`) && tag.includes(`content="${url.href}"`),
						),
						`${route}: incorrect prerendered ${key}`,
					);
				}
			}
		}
	} catch (error) {
		errors.push(`${route}: ${error.message}`);
	}
}

for (const entry of prompts) {
	const bytes = await readFile(path.join(root, entry.file));
	assert.deepEqual(jpegDimensions(bytes), [1200, 630], `${entry.file}: cover dimensions`);
}
const manifest = JSON.parse(await read('src/assets/manifest.webmanifest'));
for (const icon of manifest.icons) {
	assert.equal(icon.type, 'image/png');
	const bytes = await readFile(path.join(root, 'src/assets', icon.src));
	assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
	assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
}

if (errors.length) {
	console.error(errors.join('\n'));
	process.exitCode = 1;
} else {
	console.log(
		`Verified ${expectedRoutes.size} architecture pages, ${prompts.length} covers (1200×630), ${manifest.icons.length} app icons and lesson integrity${process.argv.includes('--built') ? ', including prerendered social metadata' : ''}.`,
	);
}

function jpegDimensions(bytes) {
	assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Expected JPEG');
	let offset = 2;
	while (offset < bytes.length) {
		assert.equal(bytes[offset++], 0xff, 'Invalid JPEG marker');
		while (bytes[offset] === 0xff) offset++;
		const marker = bytes[offset++];
		const length = bytes.readUInt16BE(offset);
		if ([0xc0, 0xc1, 0xc2].includes(marker)) {
			return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
		}
		offset += length;
	}
	throw new Error('JPEG dimensions not found');
}
