# CLAUDE.md

Repo-scoped guidance for Claude Code working on `donkey-jam-2026`.

## Project

**Slick Hand Joe** — Phaser 3 game about a skeleton thief and his sentient severed hand pulling off heists. Two-loop gameplay: skeleton sweet-talks the victim while the hand scuttles across the table grabbing loot. The two loops feed back: better dialogue → fewer table glances → easier hand work.

Status: post-jam independent continuation. v1.0 features still in flight. Design source of truth is `DESDOC.md` (Russian — preserve language; do not translate).

**Team:** 4 people. The user is the only coder. Other contributors: musician, sprite artist, "idea guy". Don't frame the user as "solo dev"/"only person on the project" — they are the only person *coding* but not the only person *on the project*.

## Document provenance (this repo)

`DESDOC.md` is the only human-authored doc here. Everything else under version control — this `CLAUDE.md`, `TODOS.md`, `phaser-osmose-statemachine-tutorial.md` (archived) — and the per-feature docs under `~/.gstack/projects/slick_hand_joe/` were drafted by Claude across past sessions and reviewed only briefly before commit. They're prior-Claude proposals the user signed off on lightly, not user-stated rules. When citing a convention from one of them, frame it as "convention we settled on", not "the user said". When current user input contradicts a convention here, user input wins; the doc is the lower-confidence source.

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

vitest. Pure-TS surfaces covered (`utils.ts`, `StateMachine.ts`). Phaser-coupled code (`MusicController.ts`, the scenes) is deferred — needs scene mocking, separate pass. Co-located convention: `foo.test.ts` next to `foo.ts`. Pre-commit runs `bun run test` alongside typecheck + lint.

## Source map

- `src/main.ts` — Vite entry, mounts the Phaser game into `#game-container`
- `src/game/main.ts` — Phaser config, scene registration
- `src/game/config.ts` — game dimensions and shared constants
- `src/game/scenes/Boot.ts` — minimal boot
- `src/game/scenes/Preloader.ts` — asset loading
- `src/game/scenes/MainMenu.ts` — title menu
- `src/game/scenes/MainGame.ts` — **the gameplay meat**; most v1.0 work lands here
- `src/game/scenes/GameOver.ts` — game over screen
- `public/assets/` — sprites grouped by category: `skel/`, `demon/`, `loot/`, `blocks/`, `emojis/`, `scale/`, `menuUI/`, `music/`

## Conventions

- **Conventional Commits.**
- **Don't translate** existing Russian content (DESDOC, comments). New content: English.
- **Entity state → Osmose-style FSM**, not ad-hoc booleans. Pattern reference: `phaser-osmose-statemachine-tutorial.md`. Generic class lives at `src/game/StateMachine.ts` (`StateMachine<Names, Args>` + `State<Names, Args>` with `enter`/`execute`/`exit` hooks). Subclass `State` per substate, instantiate the machine in `init()`, drive it from `update()` via `step()`.
- **Introduce an FSM with the feature that needs it, not preemptively.** Apply when a subsystem gains a state with timer/exit semantics (e.g., dialogue's asking + cooldown, hand's stun + hidden), or when transitions get gnarly enough that flag-juggling shows up. Plain enum-style direction code with simple gating doesn't need a machine — converting it without new states is churn. Pair the refactor with the feature that justifies it.
- **One scene per game mode, not per subsystem.** Within a heist, dialogue and arcade are tightly coupled by design (shared suspicion meter, bubbles obscuring the arcade area, stash state gating dialogue events). They live in one scene with internal FSMs for substate isolation. Inter-mode boundaries (heist vs. adventure map vs. menu) get their own scenes; intra-mode subsystems do not.
- **Init goes in Phaser's `init()`, not `create()`.** `init` runs every scene start; state that must reset on restart belongs there. `create` is for object construction.
- **Input.** `Phaser.Input.Keyboard.JustDown(key)` for one-shot actions (answers, attacks, menu selects). `key.isDown` is for held actions (movement).
- **Phaser origin + hit area on geometry interactives.** Phaser's geometry shapes (`Rectangle`, `Circle`, `Polygon`, ...) default to origin `(0.5, 0.5)` for rendering but their default `setInteractive()` hit area is `(0, 0, w, h)` in LOCAL coords without subtracting origin — so a center-anchored Rectangle's auto hit area lands in the bottom-right quadrant of its visual, and only the bottom-right corner is clickable. Two options: (a) use `setOrigin(0)` and pass the visual top-left as the position (canonical example: `src/game/scenes/Settings.ts:addAdjustButton`), or (b) keep center origin and pass an explicit hit area `new Phaser.Geom.Rectangle(-w/2, -h/2, w, h)` along with `Phaser.Geom.Rectangle.Contains` to `setInteractive()`. Prefer (a) — fewer moving parts. `Image` doesn't have this gotcha; its default hit area uses the texture frame, which Phaser correctly offsets by origin.
- **CSS cursor hotspot at the visible fingertip.** When defining a `MENU_CURSOR`-style custom cursor with `url(...) X Y, pointer`, the `X Y` hotspot must land on the visible click point in the cursor image (the fingertip, for our hand cursor). Verify by measuring the image — never eyeball. The offset isn't apparent on large `Image`-based buttons (the hit area absorbs a small misalignment), but small geometry buttons (e.g. Settings's 40×40 +/- buttons) make it immediately obvious as "active area offset to the left/right". See `src/game/config.ts` MENU_CURSOR comment for the cursor.png-specific math.
- **No magic-number measurements.** Sprite/asset sizes get measured (`magick identify`) before placing — never guessed. Add the dimension as a comment if it isn't obvious from the constant name.
- **Scene shutdown.** Whenever a scene starts background work (music, `delayedCall`, colliders that aren't auto-cleaned), it owns cleanup in `shutdown()`.
- **Logging.** Use `log.<namespace>(...)` from `src/game/debug.ts` (currently `joe:dialogue` / `joe:loot` / `joe:music` / `joe:sus`). Don't use `console.log` for runtime traces — `console.warn`/`console.error` are still fine for genuine warnings/errors. Enable in browser DevTools: `localStorage.debug = 'joe:*'` (or any subset, e.g. `'joe:dialogue'`, `'joe:*,-joe:loot'`) then reload.

## Architectural decisions

Things we considered and rejected, kept around so future-Claude doesn't re-propose them.

- **Splitting heist into Dialogue + Arcade scenes.** Inter-loop coupling (suspicion meter read by both, bubbles obscure the arcade area, stash state gates "look at table" events, single game-over) is by design — putting it across a `scene.launch` boundary turns class-field access into pub/sub ceremony without buying independent lifecycles. Internal FSMs deliver the same cognitive isolation for free. Inter-*mode* scenes (heist vs. adventure map vs. menu) remain the right boundary.
- **Enabling `strictPropertyInitialization`.** ~20 fields still need late init via Phaser's `init()`/`create()` (scene plugins like `this.add`/`this.physics` aren't available at construction time). Flipping the flag would scatter 20 `!:` markers across the class for negligible safety gain — the bug class it catches (declared-but-never-written field) is already prevented by `init()`/`create()` discipline, and the typo bugs we did hit were caught by plain `strict: true`. Keep it off.

## In-repo reference docs

- `DESDOC.md` — design doc (Russian, source of truth for game design)
- `TODOS.md` — open backlog: v1.0/v2.0 features, bugs, deferred decisions. Iterate against it; check items off as they land.
- `phaser-osmose-statemachine-tutorial.md` — Osmose's FSM tutorial, archived for reference

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
  - `DESDOC.md` — game design source of truth (Russian, hand-curated).
  - `TODOS.md` — active backlog (features, bugs, deferred).
  - `~/.gstack/projects/slick_hand_joe/` — gstack per-feature design docs (model-readable).
  - `~/.claude/projects/-workspace/memory/` — cross-project user memory (global, not per-project; see global `CLAUDE.md`).
- **Open coordination — DESDOC vs. gstack design docs.** DESDOC.md is the long-form game design narrative (Russian). Per-feature gstack docs (e.g., the alarm-reactions one at `~/.gstack/projects/slick_hand_joe/dev-master-design-20260509-083149.md`) overlap with DESDOC content — both describe game mechanics. Canonical structure / merge-or-keep-separate / cross-referencing convention is TBD. Resolve next session.
