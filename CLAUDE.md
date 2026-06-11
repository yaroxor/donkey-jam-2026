# CLAUDE.md

Repo-scoped guidance for Claude Code working on `donkey-jam-2026`.

## Project

**Slick Hand Joe** — Phaser 3 game about a skeleton thief and his sentient severed hand pulling off heists. Two-loop gameplay: skeleton sweet-talks the victim while the hand scuttles across the table grabbing loot. The two loops feed back: better dialogue → fewer table glances → easier hand work.

Status: post-jam independent continuation. v1.0 features still in flight. Design source of truth is `DESDOC.md` (Russian — preserve language; do not translate).

**Team:** 4 people. The user is the only coder. Other contributors: musician, sprite artist, "idea guy". Don't frame the user as "solo dev"/"only person on the project" — they are the only person *coding* but not the only person *on the project*.

## Document provenance (this repo)

`DESDOC.md` is the only human-authored doc here. Everything else under version control — this `CLAUDE.md`, `TODOS.md` — and the per-feature docs under `~/.gstack/projects/slick_hand_joe/` were drafted by Claude across past sessions and reviewed only briefly before commit. They're prior-Claude proposals the user signed off on lightly, not user-stated rules. When citing a convention from one of them, frame it as "convention we settled on", not "the user said". When current user input contradicts a convention here, user input wins; the doc is the lower-confidence source.

The gstack docs sit one rung lower still: they are wordy enough that the user could not review them completely — treat them as **advisory at best** (user direction, 2026-06-11). That includes their "pre-decided" items (e.g. the alarm-reactions R1-R5 reductions): good starting points to surface when work resumes, not settled rulings to silently apply.

## Stack

- Phaser 3.90, TypeScript, Vite
- Package manager: **bun** — use `bun run`, not `npm run`

## Commands

```
bun run dev         # vite dev server
bun run build       # production build
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
bun run test        # vitest run (one-shot; runs in pre-commit)
bun run test:watch  # vitest watch mode (active TDD)
```

## Testing

- **vitest** for unit tests. Pure-TS surfaces covered: `utils.ts`, `StateMachine.ts`, `MusicController.ts`, `settings.ts`, the hand FSM states in `hand-states.ts`, and `AskingState`'s ready-callback contract. The rest of `dialogue-states.ts` (`AskingState.execute`/`fail`, `IdleState`, `CooldownState`) is untested — execute/fail call the runtime `Phaser` global, which vitest doesn't provide. Co-located convention: `foo.test.ts` next to `foo.ts`.
- **Playwright** for end-to-end browser tests at `e2e/`. Covers Phaser-coupled scene lifecycle paths that can't be unit-tested without scene mocking (`8e51714` landed the suite + smoke test for `MainGame`).
- Pre-commit runs typecheck + lint + `bun run test` (vitest one-shot) — those gates can't be missed.
- **Before handing changes back to the user for playtest, run `bunx playwright test`.** Pre-commit doesn't run Playwright (browser overhead), so Claude owns this gate. Catches Phaser scene-lifecycle regressions that vitest can't see (e.g., the `cursors` ordering bug that motivated the suite).

## Source map

- `src/main.ts` — Vite entry, mounts the Phaser game into `#game-container`
- `src/game/main.ts` — Phaser config, scene registration
- `src/game/config.ts` — game dimensions, shared constants, `LEVELS` / `CURRENT_LEVEL_INDEX`, loot-meter layout
- `src/game/MusicController.ts` — track registration + tact-aligned switches + volume
- `src/game/settings.ts` — localStorage persistence (`slick_hand_joe:settings`) + `effectiveVolume` helper
- `src/game/debug.ts` — `log.<namespace>(...)` factory for runtime traces
- `src/game/scenes/Boot.ts` — minimal boot
- `src/game/scenes/Preloader.ts` — asset loading
- `src/game/scenes/MainMenu.ts` — title menu
- `src/game/scenes/MainGame.ts` — **the gameplay meat**; most v1.0 work lands here
- `src/game/scenes/PauseScene.ts` — overlay pause
- `src/game/scenes/Settings.ts` — volume + dev loot tuner
- `src/game/scenes/Win.ts` / `GameOver.ts` — level-end screens
- `src/game/scenes/dialogue-states.ts` — FSM substates for dialogue (`AskingState`, `CooldownState`)
- `src/game/scenes/hand-states.ts` — FSM substates for hand (`LeftState`/`RightState`/`UpState`/`DownState`/`StunnedState`)
- `src/lib/StateMachine.ts` — generic `StateMachine<Names, Args>` + `State<Names, Args>`
- `src/lib/utils.ts` — generic helpers
- `e2e/` — Playwright integration tests
- `tools/sfx/` — Python audio synth primitives (build-time SFX generation)
- `public/assets/` — sprites grouped by category: `skel/`, `demon/`, `loot/`, `blocks/`, `emojis/`, `scale/`, `menuUI/`, `music/`

## Conventions

- **Conventional Commits.**
- **Don't translate** existing Russian content (DESDOC, comments). New content: English.
- **Entity state → FSM** (`src/lib/StateMachine.ts`; usage examples in `dialogue-states.ts` / `hand-states.ts`). Subclass `State<Names, Args>` per substate, instantiate the machine in `init()`, drive it from `update()` via `step()`. For when to use an FSM vs. a lookup table, the "introduce-with-feature" timing rule, and the one-scene-per-game-mode topology, see `ARCHITECTURE.md`.
- **Init goes in Phaser's `init()`, not `create()`.** `init` runs every scene start; state that must reset on restart belongs there. `create` is for object construction.
- **Input.** `Phaser.Input.Keyboard.JustDown(key)` for one-shot actions (answers, attacks, menu selects). `key.isDown` is for held actions (movement).
- **Phaser origin + hit area on geometry interactives.** Phaser's geometry shapes (`Rectangle`, `Circle`, `Polygon`, ...) default to origin `(0.5, 0.5)` for rendering but their default `setInteractive()` hit area is `(0, 0, w, h)` in LOCAL coords without subtracting origin — so a center-anchored Rectangle's auto hit area lands in the bottom-right quadrant of its visual, and only the bottom-right corner is clickable. Two options: (a) use `setOrigin(0)` and pass the visual top-left as the position (canonical example: `src/game/scenes/Settings.ts:addAdjustButton`), or (b) keep center origin and pass an explicit hit area `new Phaser.Geom.Rectangle(-w/2, -h/2, w, h)` along with `Phaser.Geom.Rectangle.Contains` to `setInteractive()`. Prefer (a) — fewer moving parts. `Image` doesn't have this gotcha; its default hit area uses the texture frame, which Phaser correctly offsets by origin.
- **CSS cursor hotspot at the visible fingertip.** When defining a `MENU_CURSOR`-style custom cursor with `url(...) X Y, pointer`, the `X Y` hotspot must land on the visible click point in the cursor image (the fingertip, for our hand cursor). Verify by measuring the image — never eyeball. The offset isn't apparent on large `Image`-based buttons (the hit area absorbs a small misalignment), but small geometry buttons (e.g. Settings's 40×40 +/- buttons) make it immediately obvious as "active area offset to the left/right". See `src/game/config.ts` MENU_CURSOR comment for the cursor.png-specific math.
- **No magic-number measurements.** Sprite/asset sizes get measured (`magick identify`) before placing — never guessed. Add the dimension as a comment if it isn't obvious from the constant name.
- **Scene shutdown.** Whenever a scene starts background work (music, `delayedCall`, colliders that aren't auto-cleaned), it owns cleanup in `shutdown()`.
- **Logging.** Use `log.<namespace>(...)` from `src/game/debug.ts` (currently `joe:dialogue` / `joe:loot` / `joe:music` / `joe:sus`). Don't use `console.log` for runtime traces — `console.warn`/`console.error` are still fine for genuine warnings/errors. Enable in browser DevTools: `localStorage.debug = 'joe:*'` (or any subset, e.g. `'joe:dialogue'`, `'joe:*,-joe:loot'`) then reload.
- **Maintain the doc-set as the project evolves.** Keep `docs/DOC-MAP.md` current when docs are added, retired, or change role. For gstack design docs at `~/.gstack/projects/slick_hand_joe/` whose state-of-play diverges from the declared `Status:` (feature ships, deps clear, framing shifts), append a dated overlay after the header: `## Implementation note (YYYY-MM-DD)` when a feature has shipped, or `## Status update (YYYY-MM-DD)` when context changed without shipping. Optionally update the `Status:` line itself. gstack has no auto-update pipeline; the inventory + overlays are model-maintained.

## In-repo reference docs

- `docs/DESDOC.md` — design doc (Russian, source of truth for game design / narrative). Hand-authored; preserve language.
- `docs/ARCHITECTURE.md` — cross-cutting patterns + rationale + rejected designs. Read alongside this file when "how" questions need "why".
- `docs/TODOS.md` — open backlog: v1.0/v2.0 features, bugs, deferred decisions. Iterate against it; check items off as they land.
- `docs/DOC-MAP.md` — living inventory of the doc-set (in-repo + gstack per-feature). Update on doc additions/retirements.
- `README.md` — human onboarding (game pitch, dev quickstart).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

## gstack integration

This project is integrated with gstack — slug `slick_hand_joe` (mounted at `/workspace` per the host container setup; gstack uses `$PROJECT_NAME`-derived paths, see global `CLAUDE.md`).

- **Per-feature design docs** produced by `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, etc. land at `~/.gstack/projects/slick_hand_joe/`. Other gstack skills auto-discover them on subsequent runs.
- **Persistence reminder.** Claude's per-session conversation memory does NOT survive container restart. Anything worth keeping between sessions must live in a file:
  - `CLAUDE.md` (this file) — repo-scoped guidance for future Claude sessions.
  - `docs/DESDOC.md` — game design source of truth (Russian, hand-curated).
  - `docs/TODOS.md` — active backlog (features, bugs, deferred).
  - `~/.gstack/projects/slick_hand_joe/` — gstack per-feature design docs (model-readable).
  - `~/.claude/projects/-workspace/memory/` — cross-project user memory (global, not per-project; see global `CLAUDE.md`).
- **DESDOC vs. gstack design docs.** DESDOC.md is the game-design narrative (Russian, hand-authored, long-form). Per-feature gstack docs are scoped to one feature each (English, model-authored, granular). They overlap on mechanics but not on role: DESDOC says *what the game is*; gstack docs say *why this implementation*. ARCHITECTURE.md cross-references specific gstack docs where a pattern's original rationale lives.
