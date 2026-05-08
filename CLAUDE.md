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
- **One scene per game mode, not per subsystem.** Within a heist, dialogue and arcade are tightly coupled by design (shared suspicion meter, bubbles obscuring the arcade area, stash state gating dialogue events). They live in one scene with internal FSMs for substate isolation. Inter-mode boundaries (heist vs. adventure map vs. menu) get their own scenes; intra-mode subsystems do not.
- **Init goes in Phaser's `init()`, not `create()`.** `init` runs every scene start; state that must reset on restart belongs there. `create` is for object construction.
- **Input.** `Phaser.Input.Keyboard.JustDown(key)` for one-shot actions (answers, attacks, menu selects). `key.isDown` is for held actions (movement).
- **No magic-number measurements.** Sprite/asset sizes get measured (`magick identify`) before placing — never guessed. Add the dimension as a comment if it isn't obvious from the constant name.
- **Scene shutdown.** Whenever a scene starts background work (music, `delayedCall`, colliders that aren't auto-cleaned), it owns cleanup in `shutdown()`.

## In-repo reference docs

- `DESDOC.md` — design doc (Russian, source of truth for game design)
- `REFACTOR.md` — active refactor + bug backlog. Iterate against it; delete when empty.
- `phaser-osmose-statemachine-tutorial.md` — Osmose's FSM tutorial, archived for reference
