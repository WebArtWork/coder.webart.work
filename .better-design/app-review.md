# Coder design and SEO image review — 4 November 2026

306 public routes and five client-route families inventoried. All 306 public routes received rendered checks at 390, 1440 and 1728 px (918 checks). Findings: 1 critical, 3 serious, 5 moderate and 3 minor; all except the existing moderate bundle-size warning were addressed.

This was a repair and polish pass. The existing Bevel light / Linear Quality dark styling, fonts, icons and brand artwork were preserved. Existing workspace changes were retained. Full-size touch controls use more toolbar space; wrapping support is retained for compact editor tools.

## Most important repairs

| Severity | Evidence | Surface and finding | Correction | Guidance |
| --- | --- | --- | --- | --- |
| Critical | Measured + derived | Every prerendered page could remain covered by the startup overlay without JavaScript; escaped noscript CSS also appeared as literal text. | Render the overlay only after hydration; remove its obsolete noscript fallback. | Static-content integrity check; no dedicated retrieved Better Design rule (coverage gap). |
| Serious | Derived, then rendered | All 120 lessons repeated examples, trade-offs, exercises, questions and completion controls, with duplicate IDs. | Keep one complete sequence and one understood/undo control. | Content/DOM integrity check; no dedicated retrieved rule (coverage gap). |
| Serious | Derived + browser interaction | The system canvas had keyboard editing disabled. | Enable Foblex withA11y; handle fDeleteSelected instead of document-wide deletion. | rule/no-click-on-non-interactive; keyboard operation guidance. |
| Serious | Measured | Shared header and desktop navigation targets were too small; zoomed-out node delete buttons were tiny. | Use 44 px header/navigation targets; wrap compact editor tools on phones; use the full-size selected-item toolbar delete action on coarse pointers. | spacing/touch-target, rule/touch-target-min-44px. |
| Moderate | Derived + browser interaction | Learn module links could land on a closed module. | Open valid fragments on navigation and reopen a module on repeated link clicks. | Navigation principle; no dedicated retrieved rule ID (coverage gap). |
| Moderate | Derived + browser interaction | Systems lost its active navigation state on singular /system/:id routes. | Match both route families explicitly. | Navigation principle; no dedicated retrieved rule ID (coverage gap). |
| Moderate | Derived + rendered | Learn and Glossary lacked H1s, and catalog disclosure titles were spans. | Add page H1s and semantic H2 disclosure headings; retain mobile topbar labels. | Heading hierarchy check; no dedicated retrieved rule ID (coverage gap). |
| Moderate | Derived | Shared-system loading had no page content. | Add a titled loading state and status announcement. | Feedback principle; no dedicated retrieved rule ID (coverage gap). |
| Minor | Derived + browser interaction | Inline glossary terms used simulated buttons; their hover CSS was unguarded. | Use native type=button controls, preserve exact inline whitespace and gate hover to fine pointers. Definition clicks leave quiz answers unchanged and restore focus. | rule/native-element-first. |
| Minor | Better Design text check | Filters used the ambiguous label Done; the guest-progress explanation was unnecessarily long. | Use Show results and shorter progress copy, with Ukrainian translations. | Better Design comprehension screenshot and fifteen-second checks. |
| Minor | Derived + built metadata | Social images lacked accessible descriptions. | Add route-relevant og:image:alt and twitter:image:alt; strengthen the image checker. | Social-metadata check; no dedicated retrieved rule ID (coverage gap). |

Files changed include app.component.ts, the lesson/catalog/profile/editor/shared templates, linked-text, filters-modal and splash components, styles.scss, index.html, Ukrainian translations and tools/seo/check-images.mjs.

## SEO image assessment

- Inspected a contact sheet containing all 103 JPEG covers and full-size active lesson/practice covers. The graphics consistently depict software modules, with legible Coder branding and safe text margins. No chess artwork remains in the reviewed covers.
- Five covers are referenced by the 306 public routes: home, lessons, practice, privacy and licenses. Sharing the relevant hub cover across individual lessons/exercises is valid; it is not a missing-image defect. Glossary currently shares the lesson cover.
- All 103 covers are JPEGs at 1200 × 630. Active covers are below 300 kB. The seven manifest icons have matching PNG dimensions.
- The built og:image and twitter:image URLs match the route catalog; descriptions are present. The production domain, company metadata and seed social tags use coder.webart.work.
- The 98 unreferenced covers include retired filenames. They were retained to avoid deleting existing assets; they do not affect which cover a current route shares.
- No artwork replacement was needed. A dedicated glossary cover or per-lesson covers would be optional differentiation, not an SEO repair.

## Verification and interpretation

- Angular production compilation and prerendering succeeded for all 306 public routes in an isolated review output directory.
- The all-route browser sweep found no horizontal page overflow, missing H1s, duplicate IDs or broken images across its 918 route/width checks. Shared templates and changed interactions were rechecked against the final build.
- Better Design guidance loaded: marketing, navigation, accessibility and whole-app review rules. Its comprehension checks were run on the affected panels. Its dashboard structure review correctly returned NOT APPLICABLE for the existing member home; no new dashboard kit or redesign was introduced.
- Better Design spacing measurements used rendered DOM at the required widths. Its raw target findings for inline glossary terms and radio/checkbox glyphs require context: inline text has a target-size exception, and full enclosing labels provide the choice controls' hit areas. Choice controls were also aligned to the first line instead of stretching with multi-line labels.
- Screen-reader-only status spans produced apparent zero gaps; they are not visible controls. Canvas children outside the clipped canvas are not page overflow. These were adjudicated as measurement limitations rather than reasons to distort the UI. No global spacing score or accessibility certification is claimed.
- review-ui-code is not exposed by the connected Better Design server. Source review and an independent skeptic pass were performed instead.

## Remaining item and coverage limits

**Moderate, derived:** the initial production bundle is approximately 687 kB against the existing 500 kB warning budget (about 161 kB estimated transfer). It remains below the 1 MB error budget. Bundle reduction is a separate performance change; this pass did not hide or relax the budget.

The member-only home, live Google sign-in, account deletion, publication/sharing and a real shared-system ready state were not exercised against production accounts. Their reachable source and local states were reviewed. Test-browser external requests were blocked; editor checks used an isolated local fixture. No user account was changed or shared data published. The shared loading/missing/ready templates were inspected, but backend-dependent states are not claimed as visually approved.

Final results: 27 of 27 shared-template/width checks passed, all 12 isolated interaction checks passed, and all 306 final SEO image/meta checks passed. Angular template compilation after formatting also passed. The final home and editor spacing rechecks had zero critical or serious findings; exercise target flags refer to native glyphs inside their larger labels.

Better Design returned no result for the final Glossary and Privacy spacing rechecks because the connection reached its monthly free-call limit. Those two MCP rechecks are unverified; their browser layout checks passed. No subscription was started or account setting changed.

The final layout rerun covers each public template at all three widths; the exhaustive 918-check sweep preceded the last common-header and native-choice alignment adjustments. All 306 final prerendered image/meta outputs were checked again. Individual lesson, exercise and challenge prose was not manually editorially reviewed paragraph by paragraph, and there was no separate Better Design comprehension call for every data record.

Legacy chess components remain in the repository but are not reachable from the active route graph. They were excluded from current-page findings. The feature map and screen inventory record the current route families and additional dialogs/states.

## Subsequent requested regeneration

At the user's explicit request, all 103 SEO covers were subsequently replaced using fresh artwork generated with the built-in image_gen tool and the project's deterministic typography renderer. The fresh master is tools/seo/brand/seo-artwork-2026-11-04.png; the exact prompt and cover copy are recorded in tools/seo/brand/generation-prompts.json and tools/seo/image-prompts.json. All 103 file checksums changed, all covers remain 1200 × 630, and the image checks pass for all 306 public routes. Logo, favicon and hero checksums were preserved. The renderer now supports -SeoOnly and measures title wrapping to prevent text overflow. This supersedes the earlier decision to retain the previous SEO artwork.
