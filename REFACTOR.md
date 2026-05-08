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

### 6. Polled `isDown` instead of `JustDown`
**Where:** `src/game/scenes/MainGame.ts` dialogue input checks in `update()`.
`key.isDown` is true every frame the key is held — one wrong-answer press fires `answerFail` many times. The `susProgressED` latch exists only to suppress this. `Phaser.Input.Keyboard.JustDown(key)` fires once per physical press. Fixed by refactor 5.

### 7. Contradictory music flags
**Where:** `src/game/scenes/MainGame.ts` `music12Switched` / `music21Switched`.
Independent booleans where both-true is meaningless. Fixed by refactor 3.

### 8. `Number.MAX_VALUE` time sentinels
**Where:** `src/game/scenes/MainGame.ts` — `1.7976931348623157E+308` for "no dialogue active". Removed by refactor 2 — `state === 'idle'` becomes the real signal.

### 9. Dead key-clear in `endDialogue`
**Where:** `src/game/scenes/MainGame.ts` `endDialogue()`.
Clears `rightAnswerKey`, `wrongAnswer1Key`, `wrongAnswer2Key` to `undefined` but leaves the `*Key2` (hack-key O/E/U) variants. Pressing E or U after dialogue ends still triggers `answerFail`. Naturally resolves once refactor 2 + 5 land — input becomes state-owned.

### 10. Dead fields `wrong1` / `wrong2`
**Where:** `src/game/scenes/MainGame.ts` field declarations.
Declared as `Phaser.GameObjects.Image` but never assigned or read anywhere. Quick cleanup.

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

### 2. Dialogue state machine
- Add `src/game/StateMachine.ts` — Osmose's pattern ported to TS. String-literal union for state names; generic `stateArgs`; include an `exit()` hook (the tutorial mentions it but doesn't show it — we want it).
- States: `idle | asking | cooldown`.
- Replaces: `isDialogueGoing`, `susProgressED`, `timeOfDialogueStart`, `timeDialogueEnd`.
- Time-driven transitions: use `scene.time.delayedCall` from `enter()` (auto-cleared on scene shutdown), not elapsed-time checks in `execute()`.

### 3. Music state
- `currentMusicTrack: 1 | 2` field; `musicSwitchTrack1to2` reads & sets it.
- Restore `musicSwitchTrack2to1` (deleted in refactor 1) wired to right-answer transition.
- Could later be its own tiny FSM with beat-aligned transitions in `enter()`.

### 4. Scene lifecycle
- All state init in `init()`, not `create()`.
- `shutdown()` stops both music tracks, removes colliders, drops references to pending timers.

### 5. JustDown for dialogue keys
Switch dialogue answer reads in `update()` to `Phaser.Input.Keyboard.JustDown`. Will likely be subsumed by refactor 2 — input handling moves into the state machine's `execute()`.

---

## Infra (pre-existing, blocking)

### A. Pre-commit hook hasn't been honored
`.pre-commit-config.yaml` declares typecheck and eslint hooks but recent commits show typecheck failures landing on master, and `.git/hooks/pre-commit` is absent. Run `pre-commit install` locally and stop using `--no-verify`.

### B. ESLint config is ESM but package.json isn't
`eslint.config.js` uses `import` syntax; `package.json` lacks `"type": "module"`. `bun run lint` errors with `Cannot use import statement outside a module`. Either rename to `.mjs` or add `"type": "module"` (and audit the `.js` files for require/import compatibility).

### C. Rollup native binary missing
`bun run build` errors with `Cannot find module '@rollup/rollup-linux-arm64-gnu'`. Likely env-specific (ARM64 container; rollup's optionalDependencies didn't install for this arch). Fix at the install boundary, not in code.

---

## Deferred (revisit later)

- **Hand FSM.** Reuse `StateMachine.ts` from refactor 2. States: Up/Down/Left/Right + future Stunned + Hidden. Wait until v1.0 stun TODO is in flight.
- **Extract magic numbers to `config.ts`.** Many positions/sizes/timings repeat in `MainGame.ts`. Defer until layout is stable.
- **`strictPropertyInitialization`.** Revisit after refactor 2.

## Decided against

- **Splitting heist into Dialogue + Arcade scenes.** Inter-loop coupling (suspicion meter read by both, bubbles obscure the arcade area, stash state gates "look at table" events, single game-over) is by design — putting it across a `scene.launch` boundary turns class-field access into pub/sub ceremony without buying independent lifecycles. Internal FSMs (refactor 2) deliver the same cognitive isolation for free. Inter-*mode* scenes (heist vs. adventure map vs. menu) remain the right boundary.
