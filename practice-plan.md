# Practice plan: practice for the Theory lessons

The Theory hub has 25 lessons, but Practice covered mostly tactics and calculation. This plan
listed the practices that support the rest of the lessons, and the changes the games importer and
the games library needed for them. All three phases were approved and built in one go; this is
the approved list with what was done.

## Naming

1. **Done.** This file is `practice-plan.md`, and it says "practice" throughout.
2. **Done.** "Quiz" is "practice" in the code: `pages/puzzle-practice` (`PuzzlePracticeComponent`),
   `feature/practice/practice.service.ts` (`PracticeService`), the `practice:` route key, and
   `practice.json` (was `quiz.json`) with `MateItem`/`PracticeSets`. `/quiz?type=…` still
   redirects. Stats stay under the `wawchess_quiz` storage key so nothing saved is lost.

## Importer (`tools/chess-import`)

3. **Done.** `threat` per position: a null-move search at depth 12, kept when it gains 150+ cp.
4. **Done.** `tempting`: the game's losing capture or check (or a candidate one) with its refutation.
5. **Done.** `evalBand` for quiet positions only; borderline scores are left out.
6. **Done.** `features`: pawn weaknesses, passed pawns, outposts, open and half-open files, IQP,
   hanging pawns, bishop pair, opposite-coloured bishops (`src/chess/structure.ts`, no engine).
7. **Done.** `endgameType` per position.
8. **Done.** `sacrifices` per game: sound, unsound or unclear, with the replies.
9. **Done.** `openingPositions` per game: plies 6–24 scanned, the worst opening mistakes analysed.
   Lower-rated games come first in `openings.json`.
10. **Done.** `--practice-mix` balances each batch across the practices, like `--difficulty-mix`.
11. **Done.** `npm run games:enrich` adds the fields to the games already in `games.json`; new
    imports get them too.
12. **Done.** One file per practice: `threats.json`, `eval.json`, `features.json`, `safe.json`,
    `visualize.json`, `openings.json`, `sacrifices.json`. Endgames come from the catalog, which now
    has `endgame` and `structure` per puzzle.
13. **Done.** Three quiet moments per game go to the engine instead of two, for more
    candidate-move positions.

## New practices

14. **Done.** Review (`/practice/review`): misses from every practice come back after 1, 3 and 7 days.
15. **Done.** What's the threat? (`/practice/threats`)
16. **Done.** Who is better? (`/practice/who-is-better`)
17. **Done.** Spot the feature (`/practice/spot-the-feature`)
18. **Done.** Is it safe? (`/practice/is-it-safe`)
19. **Done.** See it in your head (`/practice/see-it`)
20. **Done.** Endgame technique (`/practice/endgames`), with the stalemate trap theme.
21. **Done.** Opening moves (`/practice/opening-moves`): find a good move, or spot the mistake.
22. **Done.** Sound sacrifice? (`/practice/sound-sacrifice`)
23. **Done.** Mistakes from saved games: **Find my mistakes** on the Review page.

## Games library and lessons

24. **Done.** Filters for pawn structure, endgame type and sacrifice verdict.
25. **Done.** "Positional" needs the best move to use the structure; others lose the label.
26. **Done.** Each lesson's "Practice it" links to its practices and filtered games lists. Two lessons
    keep the analysis board on purpose: analysing your own games, and the opening exercise position.

## Hub

27. **Done.** The Practice hub is grouped (Every day, Tactics, Calculation, Threats and sacrifices,
    Understanding positions, Openings and endgames), with two related modes to a row.

## Still open

- The nine new pages use a copy of the Practice cover as their social image until covers of their
  own are made (see `tools/seo/image-prompts.json`). The Tactics cover still reads "Chess tactics quiz".
