# Chess import

Grows `src/data/game/games.json`, a curated set of complete Lichess games, one batch at a time.
Each game comes with up to five engine-analysed training positions (find the best move, candidate
moves, calculation, critical decisions…). The importer streams the monthly Lichess archive,
filters and scores games cheaply, runs Stockfish only on the most promising positions, and appends
a diverse set of new games.

## Setup

- **Node.js 24+.** The TypeScript sources run directly; no build step. `node:sqlite` and zstd
  support are built in.
- **Stockfish.** A native binary is strongly recommended: it is several times faster than the npm
  WASM build. Download it from <https://stockfishchess.org/download/> and use the AVX2 build on
  any CPU from 2015 on. The importer looks for an engine in this order:
  1. `--engine <path>`
  2. the `STOCKFISH_PATH` environment variable
  3. `../../stockfish/stockfish-windows-x86-64-universal.exe` relative to the project
  4. `node_modules/stockfish/bin/stockfish-18-single.js` (the npm WASM build, slow)
- **Archives.** Lichess monthly files (`lichess_db_*.pgn.zst`, from <https://database.lichess.org/>)
  in the project root or the folder above it. Add a new month whenever you like; see
  [Archives and history](#archives-and-history). A specific file, including a plain `.pgn`, can be
  passed with `--input`.

## Usage

```bash
npm run games:import                  # add up to 1,000 new games (checks + tests first)
npm run games:clear                   # remove the 1,000 oldest games
npm run games:clear -- --count 200    # remove the 200 oldest games
npm run games:wipe                    # remove all games
npm run games:import:sample           # try-out: 3,000 games → 20, in tools/chess-import/.work/sample/out
npm run games:lookahead               # build Look Ahead trees for positions that have none yet
npm run games:enrich                  # add the practice fields to games that have none yet
npm run games:import -- --help        # all options
```

**`games:import` adds, never rewrites.** Existing games stay exactly as they are, and the new
batch is appended at the end, so `games.json` is always in import order, oldest first. Every game
carries the `importedAt` time of its batch. Before importing, the script typechecks the importer
and runs its tests, and stops if anything fails.

**Each batch reads the next part of the archive.** It scans `--max-scan` games (100,000 by
default) starting where the previous batch stopped in that file, and adds up to `--max-export`
(1,000).

**You decide what stays.** Delete any game from `games.json` by hand, or use `games:clear` /
`games:wipe`. Every game ever imported is recorded in `tools/chess-import/import-history.json`
(commit it), together with the archive position, so removed games are never imported again. New
games must also be unique against the games already in the file. The app's copy in
`src/data/game/app/` is rebuilt by every import, clear and wipe; after editing `games.json` by
hand, run `npm run games:refresh`.

**Interrupted?** Ctrl+C stops after the current step. The next `npm run games:import` continues
that batch where it stopped. To throw an unfinished batch away instead, use `--fresh`. The engine
cache is kept between batches.

A `games.json` in another format, such as one from `games:extract`, is not appended to: the import
stops and asks you to run `games:wipe` first.

### Archives and history

`tools/chess-import/import-history.json` is the index of where each archive was left. Commit it:

```jsonc
{
  "src/data/game/games.json": {                       // per output file
    "archives": {
      "lichess_db_standard_rated_2026-09.pgn.zst": {   // per archive, by file name
        "cursor": { "frame": 104857600, "pos": 1834211 }, // where the next batch continues
        "gamesRead": 300000,
        "finished": false,
        "updatedAt": "2026-10-14T12:00:00.000Z"
      }
    },
    "ids": ["aB3xY9kQ", "…"]                          // every game ever added, never imported again
  }
}
```

- Without `--input`, a batch takes the **first archive not fully read**, oldest month first, and
  continues at its cursor. Once a file is read to the end it is marked `finished`, and the next
  batch moves on to the next month. When every file is finished, the import asks for a new one.
- Archives are tracked by file name, so they can live in the project root or the folder above,
  and be moved between machines.
- With `--input <file>` that file is read from its own saved position, or from the start the
  first time.
- The cursor points at a compressed frame and an offset inside it, so continuing never re-reads
  the part of the file already scanned.

### Typical commands

```bash
# A bigger batch that leans harder
npm run games:import -- --max-scan 300000 --max-export 3000 --difficulty-mix beginner=0.1,intermediate=0.3,advanced=0.4,expert=0.2

# Beginner material from lower-rated games
npm run games:import -- --min-rating 900 --max-rating 1700 --difficulty-mix beginner=0.5,intermediate=0.5,advanced=0,expert=0

# Faster, shallower analysis on a 4-core machine
npm run games:import -- --depth 16 --workers 3

# Stop after the scan to inspect candidates; the next import continues from there
npm run games:import -- --until scan
```

### Main options

| Option | Default | Meaning |
| --- | --- | --- |
| `--input` | the 2026-09 archive | `.pgn.zst` or `.pgn` |
| `--output` | `src/data/game/games.json` | the full dataset (not shipped to the app) |
| `--app-dir` | `src/data/game/app` | the app's copy: catalog, daily schedule, one file per game; `--app-dir=` with nothing skips it |
| `--max-scan` | 100000 | archive games read per batch |
| `--max-export` | 1000 | games added per batch, at most; never filled with weak or duplicate games |
| `--min-rating` / `--max-rating` | 1200 / 2400 | both players within this range |
| `--speeds` | `rapid,classical` | Lichess speeds, from the time control |
| `--depth` | 18 | deep-pass depth (`--quick-depth`, default 10, for the first pass) |
| `--workers` | 3 | Stockfish processes, one thread each (leave one core for parsing) |
| `--positions` | 5 | training positions per game, at most |
| `--min-quality` / `--min-uniqueness` | 45 / 30 | bars a game must clear to be exported |
| `--difficulty-mix` | `beginner=0.3,intermediate=0.5,advanced=0.15,expert=0.05` | wanted mix of training levels |
| `--practice-mix` | `tactics=0.3,candidates=0.2,quiet=0.2,endgame=0.15,sacrifice=0.05,tempting=0.1` | wanted share of games feeding each practice; games feeding one that is short get up to 1.3× |
| `--fresh` | off | discard an unfinished batch instead of continuing it |
| `--until` | – | stop after `scan`, `quick`, `deep`, `select` or `export` |
| `--count` | 1000 | `games:clear` only: how many of the oldest games to remove |

`--help` lists the rest: rating gap, terminations, pool sizes, MultiPV, hash, and more.

## How it works

```
archive ──stream──▶ scan ──▶ quick engine pass ──▶ deep engine pass ──▶ select ──▶ export
          (zstd)     │         top 6×N by prescore    diverse 1.6×N       diverse N    games.json
                     │         ~8 positions/game      ≤6 positions/game               app/catalog.json
                     ▼         depth 10, MultiPV 3    depth 18, MultiPV 5             app/daily.json, app/g/
                SQLite candidates  ────────── checkpoints + engine cache in .work/import.sqlite
```

1. **Scan** (no engine). Streams the archive one decompressed frame at a time. It keeps standard,
   rated, rapid/classical games that ended normally, have both players in the rating range, no BOT,
   and at least 40 plies, and that replay legally with chess.js and match their result. Each game is
   then pre-scored from Lichess `%eval` swings when present (about 10% of games), otherwise from
   material swings, sacrifices, check sequences, mating finishes, promotions and the endgame
   transition. Games that were decided early, or short draws, score low. The best candidates are
   kept on disk.
2. **Quick pass.** Stockfish at low depth on the strongest signalled positions of the top
   candidates. The move actually played is also evaluated (`searchmoves`), so the game's own mistakes
   are known.
3. **Deep pass.** A diverse subset gets full analysis: up to 5 candidate moves with evaluations and
   12-ply principal variations, the best reply, the refutation of the played move, and the
   calculation depth.
4. **Select.** Greedy pick by quality × uniqueness × difficulty-mix balance.
5. **Export.** Every record is validated (SAN/UCI agreement, legal lines, each FEN being the actual
   game position), then written atomically.

### Scores

- **Position quality (0–100).** Rewards one clearly best move (win-chance gap to the second-best),
  tactical motifs, 3–9 plies of calculation, a real mistake made at that moment in the game, and a
  position still in play. Candidate-move positions are scored instead on several playable moves
  plus at least one clear error. Positions are rejected when they are forced (≤2 legal moves), a
  plain recapture, already won whatever you play, lost whatever you play, or have no clear theme.
- **Game quality (0–100).** Mean quality of the training positions (60%), category variety,
  pre-score, and coverage. Player ratings are only a filter, never part of the score.
- **Uniqueness (0–100).** 100 minus the highest Jaccard similarity to any other selected game. The
  comparison uses token sets of opening family, pawn structure (file masks, IQP, hanging, passed,
  doubled pawns, opposite castling), material imbalance, endgame type, motifs and categories of the
  training positions. Two games sharing a training position (exact FEN) are never both selected.
  Pools of up to ~5,000 games are compared pairwise; larger ones through MinHash LSH.
- **Difficulty.** An estimated training level, not an Elo: beginner 500–1000, intermediate
  1000–1400, advanced 1400–1800, expert 1800+. It rises with calculation depth, quiet key moves,
  sacrifices, several plausible moves, a tempting wrong capture or check, defensive and positional
  themes; free pieces and mate in one lower it. A game's level is the median of its positions. The estimate rarely passes 1400, so most games are
  beginner or intermediate, and the default mix asks for what it can deliver.
- **Categories:** `tactics`, `calculation`, `candidateMoves`, `positional`, `attack`, `defense`,
  `endgame`, `criticalDecision`. A position can have several; `category` is the main one.
- **Themes:** `fork`, `pin`, `skewer`, `discoveredCheck`, `doubleCheck`, `sacrifice`, `quietMove`,
  `hangingPiece`, `mate`, `mateInN`, `backRankMate`, `promotion`, `underPromotion`,
  `perpetualCheck`.

## Output

`games.json`: an array with one object per game, written for the app to replay and drill:

```jsonc
{
  "id": "aB3xY9kQ", "url": "https://lichess.org/aB3xY9kQ",
  "white": { "name": "…", "rating": 1720 }, "black": { "name": "…", "rating": 1685 },
  "result": "1-0", "termination": "Normal", "date": "2026-09-01T00:00:20Z",
  "timeControl": "600+5", "speed": "rapid", "eco": "B90", "opening": "Sicilian Defense: Najdorf Variation",
  "pgn": "[Event …]\n\n1. e4 c5 …",          // original game, without clock/eval comments
  "moves": ["e4", "c5", …], "uciMoves": ["e2e4", "c7c5", …], "plyCount": 84,
  "difficulty": "intermediate", "difficultyRating": 1240,
  "categories": ["tactics", "criticalDecision"], "themes": ["fork"],
  "qualityScore": 72, "uniquenessScore": 68,
  "trainingPositions": [{
    "ply": 33,                                // half-moves played; the move to find is moves[33]
    "moveNumber": 17, "sideToMove": "black",
    "fen": "…",
    "category": "tactics", "categories": ["tactics", "criticalDecision"], "themes": ["fork"],
    "difficulty": "intermediate", "difficultyRating": 1180, "qualityScore": 74,
    "bestMove": { "san": "Nd3+", "uci": "f4d3" },
    "bestReply": { "san": "Kf1", "uci": "e1f1" },
    "candidateMoves": [{ "rank": 1, "san": "Nd3+", "uci": "f4d3", "cp": -420, "mate": null, "loss": 0 }, …],
    "principalVariations": [{ "rank": 1, "cp": -420, "mate": null, "san": [ … ], "uci": [ … ] }, …],
    "playedMove": { "san": "Qe7", "uci": "d8e7", "cp": -30, "loss": 390, "isBest": false, "refutation": { … } },
    "calculationDepth": 3, "engineDepth": 18
  }]
}
```

- `cp` and `mate` are from **White's** point of view, like Lichess. `loss` is the centipawns the
  side to move gives up compared with the best move (capped at 1000).
- `principalVariations[i]` belongs to `candidateMoves[i]`.
- `playedMove.refutation` is the engine line after the move that was actually played, when it was
  not the best.

### The app's copy (`src/data/game/app/`, served at `/game/`)

`games.json` is about 8 KB per game and not shipped. The app gets a slim copy (see
`src/output/app.ts`):

- `g/<id>.json`: one game, about 3 KB (1 KB gzipped). Moves as one SAN string. Each puzzle has
  `ply`, `fen`, `side`, its exercise (`mode`: `best`, `candidates` or `line`, with `target` and,
  for lines, the `solution` in UCI), category, themes, level, rating, the engine `lines` (UCI
  string, `cp`/`mate` from White's point of view) and the `played` move with its refutation.
- `catalog.json`: every game and every puzzle in brief (id, FEN, side, exercise, category,
  themes, level, opening family) plus `facets` with counts for the filter chips.
- `lookahead.json`: positions for the Look Ahead page, each with a tree of good moves three of
  your moves deep (see [Look Ahead](#look-ahead)).
- `daily.json`: date to puzzle id for the next 400 days, by weekday target rating (easier on
  Monday, harder on Saturday), unused puzzles first. Past days are never changed; future days
  whose game was removed are re-planned.

How a position becomes an exercise: candidate-move and positional positions with at least two moves
within 0.5 pawns of the best become **good moves** puzzles; tactical positions whose point is 3+
plies deep become **play the line** (the line runs to the calculation depth and ends on your move);
everything else is **best move**.

Every file goes into a staging folder first and is then swapped in, so an interrupted run never
leaves a partial `games.json` or a half-written app copy.

- `importedAt`: when the batch that added the game started.

## Look Ahead

`npm run games:lookahead` builds a tree for every training position in `games.json` that has
none yet and writes them to `app/lookahead.json`. From the position, every move within 50
centipawns of the best (the good-moves rule) is a branch; the opponent answers with the
engine's best reply; then again the good moves, down to three of your moves. Each path from the
root to a leaf is one line to find; a line ends early when the game is over.

A position is kept only when every node has at most 3 good moves and the tree has 2 to 8 lines,
so won positions where everything works don't turn into chores (they are skipped, not cut).
About a third of the positions qualify.

- Searches run at depth 16, MultiPV 5 (`--depth` to change), through the same engine cache as the
  import: root positions are already cached from the deep pass. A full run over 1,000 games takes
  about two hours; re-runs only search new positions. `--fresh` rebuilds every tree.
- The file is saved every few batches and is kept by `import`, `clear` and `refresh` (minus
  removed games), so run `games:lookahead` after an import to cover the new games.
- Trees are built from positions only (`src/analysis/lookahead.ts`), so another source of
  positions can be plugged in later.

## Practice fields (`games:enrich`)

`npm run games:enrich` adds to each game in `games.json` what the app's practices need, and every
import adds the same to its new games (`src/analysis/enrich.ts`). Nothing else changes, no game is
added or removed; games carry `enriched: <version>`, and a run only does games without the current
version (`--fresh` redoes all). It saves as it goes and continues after Ctrl+C, then rebuilds the
app's copy. Searches are depth 12 (`--depth`; an import uses its own `--depth` if lower), through
the engine cache.

Per training position:

- `threat`: the opponent's best move if the side to move passed (a null-move search, MultiPV 3),
  kept when it gains 150+ centipawns over the best move's score; `moves` lists every threat within
  50 centipawns of it.
- `evalBand`: `white`, `equal` or `black` for quiet positions only (best move no capture or check,
  second best within 40 cp, score within ±4 pawns): equal within ±0.5, a side better from 1.2.
  Scores in between are left out.
- `features`: isolated, doubled, backward and passed pawns, outposts (ranks 5–6 for White, 4–3 for
  Black, b–g files, pawn-guarded, never attackable by an enemy pawn), open and half-open files, IQP,
  hanging pawns, bishop pair, opposite-coloured bishops (`src/chess/structure.ts`, no engine).
- `endgameType`, and `tempting`: the game's losing capture or check (150+ cp) with its refutation,
  else one from the candidate moves.
- The **positional** category now needs the best move to do something with the structure (outpost,
  open file, weak pawn, passed pawn, pawn break; added as themes). Older positions without one lose
  the label; a position left with none becomes `criticalDecision`.

Per game:

- `openingPositions`: plies 6–24 scanned at depth 10; moves losing a pawn or more from a balanced
  position (±1.5) get a full MultiPV 5 search, up to two per game.
- `sacrifices`: captures and checks whose piece is taken, leaving the side two pawns down over the
  next four plies. `sound` keeps the score (loss ≤ 80 cp, not worse than −0.5), `unsound` ends worse
  than −1.5 having lost 1.5+, `unclear` otherwise; with the opponent's replies (MultiPV 3).

The app files built from them are described in `src/output/practices.ts`. The catalog also gets
`structure` and `endgame` per puzzle and `sacrifices` per game, with facets for the games filters,
and the `stalemateTrap` theme for won positions where a legal move stalemates. Three quiet moments
per game (was two) go to the engine, for more Good moves and Who is better? positions.

## Performance

Measured on a 4-core Ryzen 3 4300U, native Stockfish 19, 3 workers:

| Stage | Throughput |
| --- | --- |
| scan | ~1,100 archive games/s (~8% pass the rapid/classical + rating filters) |
| quick pass (depth 10, MultiPV 3) | ~5 games/s |
| deep pass (depth 18, MultiPV 5) | ~6–8 s per game (0.2–6 s per search) |

A default batch (100k scanned → 6,000 quick → 1,600 deep → 1,000 added) takes roughly
**3–4 hours**, mostly in the deep pass. To go faster, lower `--depth` (16 roughly halves the deep pass)
or `--deep-pool`. Memory stays flat, at one 32 MB archive frame plus small batches; everything else
lives in SQLite.

**Keep the machine awake** during long runs. If it sleeps, searches in flight can hit their
timeout on wake. Those games are then skipped, and the run continues. Stopping with Ctrl+C and
running the import again later is always safe.

**Scaling up.** Scanning millions of games costs ~20 minutes per million. The engine passes grow
with `--max-export`, not with `--max-scan`: pool sizes default to 6× and 1.6× the export target.
Candidates kept on disk are capped at `--max-candidates` (default 2× the quick pool, lowest
pre-score dropped). Selection switches to LSH above ~5,000 games.

## Files

```
tools/chess-import/
  src/cli.ts              entry point, flags → pipeline
  src/pipeline.ts         stages, checkpoints, progress
  src/pgn/                streaming reader (pzstd frames, resumable cursors), PGN parsing, header filters
  src/chess/              replay, board features, motif detection along engine lines
  src/engine/             UCI engine process and worker pool with cache
  src/analysis/           heuristic signals, position analysis, game scoring
  src/similarity/         similarity tokens, diverse selection, MinHash LSH
  src/output/             record builder, schema validation, atomic writer
  src/dataset.ts          reading, appending, clear and wipe; import history
  src/store.ts            SQLite state of the current batch
  import-history.json     every game ever imported + archive position (commit this)
  test/                   vitest suite (fixture: 60 real games from the archive, CC0)
  .work/                  working state (gitignored): import.sqlite, samples
```

## Tests

`npm run games:import` runs the typecheck and the vitest suite before every import. They cover
streaming, validity, Stockfish, duplicates, scoring, difficulty, the JSON schema, resume, and
add/clear/wipe. To run them alone:

```bash
npx tsc -p tools/chess-import/tsconfig.json
npx vitest run --config tools/chess-import/vitest.config.ts
```

Engine-dependent tests are skipped when no Stockfish is found. The resume test runs the full
pipeline on the fixture: once without stopping, and once interrupted mid-scan and again
mid-analysis, then continued. It checks that both runs produce identical output. Each search
starts from a fresh hash, so results don't depend on the order in which workers handle positions.
