# Coder brand assets

The mark and architecture illustration were created using the built-in image_gen tool. Exact prompts are in `generation-prompts.json`; original PNGs are retained here for reproducible exports. Production assets live under `src/assets`, which Angular publishes at the site root.

The public site has 12 architecture lessons, 12 interactive scenarios, a home page, two catalogs and three information pages. The retired chess implementation remains in source for reference, but is not linked or routed. Chess datasets, engine files and legacy app icons are excluded from the public build. The inherited Firebase configuration remains unused by these public learning pages; no account or saved-progress feature is advertised.

To refresh the SEO catalog after editing lessons:

```powershell
node tools/seo/prepare-coder.mjs
./tools/seo/render-brand.ps1
npm run build:seo
```

The Windows renderer uses System.Drawing for production sizing and deterministic typography around the generated artwork. It exports 1200×630 JPEG covers, a 512px logo, 64px favicon, 180px Apple touch icon and seven PNG app icons. Old SEO filenames retain generic Coder covers to replace the full previous asset set; they are not in the new sitemap. Per-cover provenance and composition are in `tools/seo/image-prompts.json`.

Practice answers are held in component signals for the current page visit. They reset on navigation or reload. Lessons and scenarios are English content and fully prerendered. The legacy translation files remain available for a future translation pass.
