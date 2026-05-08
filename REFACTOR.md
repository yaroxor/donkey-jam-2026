# REFACTOR.md

Active refactor + bug backlog for `donkey-jam-2026`. Iterate against this; check items off as they land; delete the file when it's empty.

Pattern of choice for entity state: Osmose-style FSM. Tutorial archived at `phaser-statemichne-tutorial.md` in repo root.

---

## Bugs

### 1. ~~Silent typo: `timeDialogueStrat`~~ ✅
Fixed: `timeOfDialogueStart` typo corrected in `init()`. Field disappears entirely with refactor 2.

### 2. ~~Silent typo: `currentDemon`~~ ✅
Fixed: dead `this.currentDemon += 1` removed from `progressSus()`. Demon image swap was already happening on the indexed `this.demons[currentSus]` access.

### 3. ~~`getLootRandomPos` bounds — multiple issues~~ ✅
Fixed:
- y range now uses `arcadeAreaCoords.height` (was `width`).
- comparisons rewritten as `x > leftX && x < rightX` (was the always-wrong chained `>`).
- `arcadeAreaCoordsCenter` replaced with locally-computed `arcadeAreaCenterY = arcadeAreaCoords.y + arcadeAreaCoords.height / 2`.

Runtime correctness of the offset formula (`y - center - 100 - 15 + 20`) wasn't verified — needs in-browser testing once dev server runs.

### 4. Empty `shutdown()`
**Where:** `src/game/scenes/MainGame.ts` (end of class).
Music keeps playing across scenes; `delayedCall` timers keep firing into a dead scene; colliders pile up. Fixed by refactor 4.

### 5. Restart broken
**Where:** `src/game/scenes/MainGame.ts` `create()`.
Only `music1`/`music2` are guarded with `if (!)`. Re-entering MainGame after GameOver stacks groups, sprites, and colliders. Fixed by refactor 4 (move state init to `init()`).

### 6. ~~Polled `isDown` instead of `JustDown`~~ ✅
Fixed: dialogue input now in `AskingState.execute()` using a `justDown()` wrapper around `Phaser.Input.Keyboard.JustDown(key)`. Verified in browser: F press fires exactly once per physical press; `susProgressED` latch eliminated.

### 7. Contradictory music flags
**Where:** `src/game/scenes/MainGame.ts` `music12Switched` / `music21Switched`.
Independent booleans where both-true is meaningless. Fixed by refactor 3.

### 8. ~~`Number.MAX_VALUE` time sentinels~~ ✅
Fixed: all four sentinel uses gone — `dialogueState === 'idle' | 'asking' | 'cooldown'` is the real signal now. The fields themselves are gone.

### 9. ~~Dead key-clear in `endDialogue`~~ ✅
Fixed: `hideAskingUI()` now clears all six keys (both primary and `*Key2` hack variants).

### 10. ~~Dead fields `wrong1` / `wrong2`~~ ✅
Fixed: removed from class field declarations.

---

## Refactors

### 1. ~~Strict TypeScript~~ ✅
Discovered that `strict: true` was already on; only `strictPropertyInitialization` was disabled. The 24 outstanding compile errors were the actual baseline — landed in this pass:

- `tsconfig.json` unchanged (already correct).
- All silent-property bugs (#1, #2, parts of #3) caught and fixed.
- `music1`/`music2` got proper types via a `GameSound` alias (`HTML5AudioSound | WebAudioSound`).
- `scales`/`demons`/`skels` converted from `Phaser.GameObjects.Group` to typed `Phaser.GameObjects.Image[]` — fixes the `setAlpha`-on-`GameObject` errors and is clearer code.
- `rightAnswerKey: Key | number` → `rightAnswerKey?: Key`; the `0` sentinel replaced with `undefined` and optional-chaining checks (`this.rightAnswerKey?.isDown`).
- `spawnLoot` calls had unused arguments dropped.
- `musicSwitchTrack2to1` was dead code — deleted. Will be re-added properly in refactor 3 (right-answer → track-1 transition).
- Two unused imports removed (`SCREEN_CENTER` in Preloader, `GAME_HEIGHT` in GameOver).

`strictPropertyInitialization` remains off for now. Revisit after refactor 2 lands — most ad-hoc fields will be gone by then and the boilerplate cost (`!:` annotations everywhere) drops.

### 2. ~~Dialogue state machine~~ ✅
Landed:
- `src/game/StateMachine.ts` — generic `StateMachine<Names, Args>` + `State<Names, Args>` (with `enter`/`execute`/`exit` defaults). Osmose's pattern, TS-typed.
- Three states in `MainGame.ts`: `IdleState` (initial 2s → asking), `AskingState` (UI + 3.9s timeout + input checks; transitions on right-press, fail-on-wrong-or-timeout), `CooldownState` (5s → asking).
- States are thin orchestrators; scene owns visual setup/teardown via new public `showAskingUI` / `hideAskingUI` methods.
- `progressSus` returns boolean; handles game-over (currentSus≥4 stops music + `scene.start('GameOver')`).
- `eslint.config.js` updated to honor `^_` argsIgnorePattern (needed for the `..._args: Args` shape in the base State class).
- Verified end-to-end in headless browser: 4 fail cycles → suspicion 1→2→3→4 → game over. Right-press path also exercised; timer cancellation in `exit()` confirmed (no late timeout fires after press). Restart through GameOver→MainMenu→MainGame creates a fresh FSM via `init()`.

### 3. Music state
- `currentMusicTrack: 1 | 2` field; `musicSwitchTrack1to2` reads & sets it.
- Restore `musicSwitchTrack2to1` (deleted in refactor 1) wired to right-answer transition.
- Could later be its own tiny FSM with beat-aligned transitions in `enter()`.

### 4. Scene lifecycle
- All state init in `init()`, not `create()`.
- `shutdown()` stops both music tracks, removes colliders, drops references to pending timers.

### 5. ~~JustDown for dialogue keys~~ ✅
Subsumed by refactor 2 — input handling moved into `AskingState.execute()` using the `justDown()` helper that wraps `Phaser.Input.Keyboard.JustDown`.

---

## Infra (pre-existing, blocking)

### A. ~~Pre-commit hook hasn't been honored~~ ✅
Switched from canonical Python `pre-commit` to `simple-git-hooks` (JS-native; deps land in `node_modules` so it persists with `/workspace` and bootstraps on machine switch). `.pre-commit-config.yaml` removed. Hook now declared in `package.json` under `simple-git-hooks` key; auto-wired via `prepare` script on `bun install`. Runs `bun run typecheck && bun run lint`.

### B. ~~ESLint config is ESM but package.json isn't~~ ✅
Added `"type": "module"` to `package.json` (both `eslint.config.js` and `vite.config.js` were already written as ESM). Also replaced `import.meta.dirname` with the portable `path.dirname(fileURLToPath(import.meta.url))` since the container's Node 18 predates `import.meta.dirname` (Node 20.11+). Lint now runs.

### C. ~~Rollup native binary missing~~ ✅
`bun install` picked up `@rollup/rollup-linux-arm64-gnu` once invoked fresh. Build now passes. (Likely the prior install was done on a different host arch; bun re-resolved optional platform deps when re-run.)

---

## Deferred (revisit later)

- **Hand FSM.** Reuse `StateMachine.ts` from refactor 2. States: Up/Down/Left/Right + future Stunned + Hidden. Wait until v1.0 stun TODO is in flight.
- **Extract magic numbers to `config.ts`.** Many positions/sizes/timings repeat in `MainGame.ts`. Defer until layout is stable.
- **`strictPropertyInitialization`.** Revisit after refactor 2.

## Decided against

- **Splitting heist into Dialogue + Arcade scenes.** Inter-loop coupling (suspicion meter read by both, bubbles obscure the arcade area, stash state gates "look at table" events, single game-over) is by design — putting it across a `scene.launch` boundary turns class-field access into pub/sub ceremony without buying independent lifecycles. Internal FSMs (refactor 2) deliver the same cognitive isolation for free. Inter-*mode* scenes (heist vs. adventure map vs. menu) remain the right boundary.
