# CLAUDE.md

Repo-scoped guidance for Claude Code working on `donkey-jam-2026`.

## Project

**Slick Hand Joe** — Phaser 3 game about a skeleton thief and his sentient severed hand pulling off heists. Two-loop gameplay: skeleton sweet-talks the victim while the hand scuttles across the table grabbing loot. The two loops feed back: better dialogue → fewer table glances → easier hand work.

Status: post-jam independent continuation. v1.0 features still in flight. Design source of truth is `DESDOC.md` (Russian — preserve language; do not translate).

## Stack

- Phaser 3.90, TypeScript, Vite
- Package manager: **bun** — use `bun run`, not `npm run`

## Commands

```
bun run dev         # vite dev server
bun run build       # production build
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
```

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
- **No magic-number measurements.** Sprite/asset sizes get measured (`magick identify`) before placing — never guessed. Add the dimension as a comment if it isn't obvious from the constant name.
- **Scene shutdown.** Whenever a scene starts background work (music, `delayedCall`, colliders that aren't auto-cleaned), it owns cleanup in `shutdown()`.
- **Logging.** Use `log.<namespace>(...)` from `src/game/debug.ts` (currently `joe:dialogue` / `joe:loot` / `joe:music` / `joe:sus`). Don't use `console.log` for runtime traces — `console.warn`/`console.error` are still fine for genuine warnings/errors. Enable in browser DevTools: `localStorage.debug = 'joe:*'` (or any subset, e.g. `'joe:dialogue'`, `'joe:*,-joe:loot'`) then reload.

## In-repo reference docs

- `DESDOC.md` — design doc (Russian, source of truth for game design)
- `REFACTOR.md` — active refactor + bug backlog. Iterate against it; delete when empty.
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
  - `REFACTOR.md` — architectural backlog (delete when empty).
  - `~/.gstack/projects/slick_hand_joe/` — gstack per-feature design docs (model-readable).
  - `~/.claude/projects/-workspace/memory/` — cross-project user memory (global, not per-project; see global `CLAUDE.md`).
- **Open coordination — DESDOC vs. gstack design docs.** DESDOC.md is the long-form game design narrative (Russian). Per-feature gstack docs (e.g., the alarm-reactions one at `~/.gstack/projects/slick_hand_joe/dev-master-design-20260509-083149.md`) overlap with DESDOC content — both describe game mechanics. Canonical structure / merge-or-keep-separate / cross-referencing convention is TBD. Resolve next session.
- **Open coordination — TODOs.md.** v1.0 TODOs currently live inline in DESDOC. Architectural backlog lives in REFACTOR.md. gstack convention prefers a dedicated `TODOS.md` for project-level work items, and separation-of-concerns argues for it independently (DESDOC = design narrative; TODOS.md = checklist). TBD next session.
