# ARCHITECTURE.md

Repo-level patterns and rationale for `slick_hand_joe`. Companion to `CLAUDE.md` (tactical rules cheatsheet). Where `CLAUDE.md` answers "what to do," this file answers "why this shape, what we considered, what we rejected."

Each pattern below describes the rule, the reasoning, where it's expressed in code, and (where applicable) the gstack design doc where the call was originally made. **All gstack doc references are filenames relative to `~/.gstack/projects/slick_hand_joe/`.**

---

## Scene topology: one scene per game mode

Each top-level game mode is a Phaser Scene: `Boot`, `Preloader`, `MainMenu`, `MainGame`, `PauseScene`, `Settings`, `Win`, `GameOver`. Intra-mode subsystems do NOT get their own scenes — they live as FSMs inside the owning scene.

The canonical example is `MainGame`: dialogue and arcade are two distinct subsystems but share state (`currentSus`, the suspicion meter, dialogue bubbles that obscure the arcade zone, stash state gating dialogue events) and end conditions (game-over fires from either path). Splitting them across a `scene.launch` boundary would turn direct class-field reads into pub/sub ceremony while delivering only cosmetic isolation. Internal FSMs deliver the same cognitive isolation with direct state access.

Rule: inter-mode boundaries get scenes; intra-mode subsystems get FSMs.

## State modeling: FSM when stateful, lookup table when static

Two patterns applied to different shapes of state.

**Osmose-style FSM** when a subsystem has time-bound semantics: `enter` / `execute` (per-step) / `exit` hooks, with timers, gated transitions, and per-state cleanup. Generic class at `src/lib/StateMachine.ts`. Concrete examples: `src/game/scenes/dialogue-states.ts` (AskingState + CooldownState) and `src/game/scenes/hand-states.ts` (LeftState / RightState / UpState / DownState / StunnedState).

**Lookup table** when state is a static configuration mapping — no timer, no transitions, no per-step work. The "state" is a label that selects a row of correlated config (sprite alpha, music track, palette, etc.). The original decision: the alarm-reactions design's R1 reduction (`dev-master-design-20260509-083149.md`) pushed back on a proposed `SuspicionFSM` with five states (`Sus0..Sus3` + `FullSus`), arguing those weren't FSM states but configurations. The fix: a `SUS_LEVELS: SusLevelCfg[]` table + a `setSusLevel(n)` method. *(Still proposed; not shipped — see `dev-master-design-20260511-123429.md` for the music-progression usage that would land it.)*

**Decision rule.** Ask: "does this state need to *do* something on entry, on each step, on exit?" If yes → FSM. If it's just "while in this state, show this sprite / play this track" → table.

**Timing rule.** Introduce an FSM with the feature that needs it, not preemptively. Pair the refactor with the first feature that adds real new states. Converting plain enum-style code without new states is churn.

The lookup-table form scales to multi-binding subsystems: `SUS_LEVELS` originally proposed for sprite-alpha selection alone is now framed as the architectural slot for any cross-cutting state coupled to suspicion (sprites + music + plausibly later: SFX cues, bubble pacing, hand visual treatment). Endorsed as a standalone call beyond music-progression's scope (2026-05-13 user direction).

## Config-substrate pattern

When a value will be tuned per-level, per-difficulty, per-something, surface it as a config table in `src/game/config.ts` rather than as scattered constants.

Existing example: `LEVELS: LevelConfig[]` (currently one entry `{ id: 1, lootTarget: 5, timerSeconds: 60 }`) + `CURRENT_LEVEL_INDEX`. Originated in `dev-master-design-20260511-155307.md` (loot meter). Cheap substrate now (one entry); the spine that the level-timer pass hung `timerSeconds:` on, that multi-level work will hang more entries on, that per-level music tuning will hang `music:` on.

Planned next instance: `SUS_LEVELS` (see "State modeling" above).

Rule: tables are cheap; ad-hoc constants scattered across files are expensive. When in doubt, table.

**Open questions for when `LEVELS` grows beyond one entry** (lifted from the retired dep scope map's cross-cutting questions, 2026-05-14):

- **Inline TS module vs externalized data file?** Currently TS — gives type-checking and IDE support for the single entry. Externalizing to JSON (or similar) helps when level data wants to be data-not-code: level editor support, hot reload, non-coder contributors editing levels. Defer until multi-level work has stakeholders.
- **Flat array vs campaign structure?** Today the table is a flat `LevelConfig[]` indexed by `CURRENT_LEVEL_INDEX`. A campaign (level progression with gating, per-stage difficulty curves, narrative beats between heists) wants richer structure. Defer until v2.0 adventure map shapes the requirement.
- **Anticipated columns as features land.** `lootTarget` and `timerSeconds` are already in; next is likely `stashCount` (when stash spots ships), then speculative ones like `difficultyMultiplier` / `timeBonus`. The substrate stays the same; only the row shape grows.

## Generic / project code split

- `src/lib/` — Phaser-independent, project-neutral code. Currently `StateMachine.ts`, `utils.ts`.
- `src/game/` — project-specific code. Scenes, FSM state classes, `MusicController`, `settings`, `debug`, `config`.

Established by commit `61ada2c` ("refactor: move generic code to src/lib/"). Rule: if a module could ship in a different project unchanged, `lib/`; otherwise `game/`.

## Persistence model

Single namespaced localStorage key: `slick_hand_joe:settings` (JSON-encoded `GameSettings`). All persisted settings live in this one key — no schema fan-out.

**Read-once-apply-immediately.** Each scene that needs settings calls `loadSettings()` at the moment it needs the value. No central cached load — localStorage reads are synchronous and cheap; the simplicity outweighs caching.

**Defensive defaults.** `loadSettings()` spreads `DEFAULTS` over the parsed value, so old saves with missing fields still work after schema additions. `saveSettings` swallows quota / disabled-storage errors — the session works in-memory and the player just loses persistence on reload.

Owned in `src/game/settings.ts`. Original design: `dev-master-design-20260511-183443.md`.

## DEV-only UI gating

Dev-stage controls (e.g., the in-game loot-target tuner) render conditionally on `import.meta.env.DEV`. Vite's static replacement of this flag means production builds (`bun run build` → `dist/`) dead-code-eliminate the dev paths entirely — no runtime check, no possibility of leakage, no dead UI shipped.

Canonical example: the loot-tuner row in `src/game/scenes/Settings.ts:113`. Pattern is reusable for any future dev-stage instrument that wants to live next to user-facing UI without polluting the production bundle.

Original design: `dev-master-design-20260511-183443.md`.

---

## Rejected designs

Decisions we considered and rejected, kept here so they're not re-proposed.

### Splitting heist into Dialogue + Arcade scenes

See "Scene topology" above. Internal FSMs deliver the same cognitive isolation without the cross-scene class-field access ceremony.

### Enabling `strictPropertyInitialization`

~20 fields in `MainGame` need late init via Phaser's `init()` / `create()` lifecycle (scene plugins like `this.add` / `this.physics` aren't available at construction time). Flipping the flag would scatter `!:` markers across the class for negligible safety gain — the bug class it catches (declared-but-never-written field) is already prevented by `init()` / `create()` discipline, and the typo bugs we actually hit were caught by plain `strict: true`. Keep off.

### HP-on-collision instead of stun

DESDOC.md line 72 originally pitched the obstacle-collision penalty as "стан / минус хп за врез" — stun OR HP-loss. We shipped stun (`dev-master-plan-stun-20260512-105430.md`); the HP variant came from a teammate. Parked in `TODOS.md` under deferred — revisit only if stun ends up feeling too forgiving or if we want a second failure axis alongside the timer and suspicion meter.

### Standalone Hand FSM refactor

Hand-direction state was rewritten as an FSM (`hand-states.ts`) *as part of* the stun feature, not as a preemptive refactor. Per the "introduce-with-feature" timing rule. Plain enum-style direction code with simple gating doesn't need a machine until a new state with timer/exit semantics shows up (Stunned was the trigger).
