# REFACTOR.md

Active refactor + bug backlog for `donkey-jam-2026`. Iterate against this; check items off as they land; delete the file when it's empty.

Pattern of choice for entity state: Osmose-style FSM. Tutorial archived at `phaser-osmose-statemachine-tutorial.md` in repo root.

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

### 4. ~~Empty `shutdown()`~~ ✅
Fixed: `shutdown()` now stops both music tracks. The other concerns (timers firing into dead scene, colliders piling up) turn out to be handled automatically by Phaser's per-scene resets — `scene.time` clock, physics world, input plugin, and display list are all torn down on shutdown without our help. Music alone needed explicit handling because the SoundManager is game-scoped, not scene-scoped.

### 5. ~~Restart broken~~ ✅
Fixed: state init was already moved to `init()` in refactor 2; this pass removed three remaining duplicate inits in `create()` (`currentSus = 0`, `lootAmount = 0`, `collectedLootCount = 0`) and verified clean restart end-to-end (GameOver → MainMenu → MainGame creates a fresh scene with currentSus=0, fresh FSM, fresh randomized loot).

### 6. ~~Polled `isDown` instead of `JustDown`~~ ✅
Fixed: dialogue input now in `AskingState.execute()` using a `justDown()` wrapper around `Phaser.Input.Keyboard.JustDown(key)`. Verified in browser: F press fires exactly once per physical press; `susProgressED` latch eliminated.

### 7. ~~Contradictory music flags~~ ✅
Fixed: replaced the boolean pair with `currentMusicTrack: 1 | 2`. No more contradictory states.

### 8. ~~`Number.MAX_VALUE` time sentinels~~ ✅
Fixed: all four sentinel uses gone — `dialogueState === 'idle' | 'asking' | 'cooldown'` is the real signal now. The fields themselves are gone.

### 9. ~~Dead key-clear in `endDialogue`~~ ✅
Fixed: `hideAskingUI()` now clears all six keys (both primary and `*Key2` hack variants).

### 10. ~~Dead fields `wrong1` / `wrong2`~~ ✅
Fixed: removed from class field declarations.

### 11. ~~Music switch beat-align is doubly wrong~~ ✅
Fixed:
- Math: `(MUSIC_HALF_TACT_SECONDS - beat) * 1000` ms — go forward to the next half-tact, with the unit conversion. Dropped the meaningless `Math.min`.
- SFX timing: pulled `crack-head` *out* of the delayedCall callback in `musicSwitchTrack1to2`. SFX now fires synchronously on every wrong answer (instant alarm feedback), independent of whether the track switch happens. The track swap still happens on the half-tact.

### 12. Hitboxes need tightening
**Where:** `src/game/scenes/MainGame.ts` — hand, blocks, sword block, loot.
The current arcade-physics hitboxes are rectangular and don't match the irregular sprite shapes well. Concrete cases need investigation per-sprite (likely `setSize` + `setOffset` tuning, or switching to per-sprite polygon hitboxes if the rectangular approximation is hopeless). DESDOC's "Подложка хитбоксов" item covers the *visualization* of hitboxes; this item is the underlying *correctness*.

### 13. Custom cursor too large for macOS
**Where:** `public/assets/menuUI/cursor.png` (110x110 post-rotation), referenced via `MENU_CURSOR` in `src/game/config.ts`.
macOS browsers silently reject custom cursors above ~32x32 (or ~64x64 retina) and fall back to OS default. Symptom: cursor CSS in devtools is correct, but the rendered cursor is the macOS arrow on hover transitions in MainMenu (and possibly elsewhere).
**Fix:** `convert cursor.png -resize 32x32 cursor.png`, then retune `MENU_CURSOR`'s hotspot proportionally (`55 15` on 110px → `~16 4` on 32px).

### 14. Turning into an obstacle grows the hitbox into it (instant death)
**Where:** `src/game/scenes/MainGame.ts` — `setSize` calls in the L/R/U/D direction-change handlers around the hand FSM in `update()`.
When the hand is moving parallel to an obstacle and the player turns 90°, the hand body swaps its short/long dimensions (e.g., 67-wide → 106-wide on a horizontal turn). The center stays put, so the body suddenly extends ±19.5 px further along the new long axis — if an obstacle is within 19.5 px of the hand center, it now overlaps the body, fires the hand-vs-block collider, stuns, and (on the alarm-reactions path) can kill.
Not terribly critical — happens only when the player is hugging an obstacle edge AND choosing to turn into it. Defer.
**Fix sketch:** before applying the new `setSize`, run a probe against the future AABB; if it intersects any obstacle, refuse the turn the same way the wrap-safe-zone guard refuses vertical turns when off-table.

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

### 3. ~~Music state~~ ✅
Landed:
- Replaced `music12Switched` / `music21Switched` flag pair with `currentMusicTrack: 1 | 2`.
- Restored `musicSwitchTrack2to1` (deleted in refactor 1), structurally symmetric to `1to2` minus the asymmetric `crack-head` SFX (1→2 plays it as a "scratch" punishment cue, 2→1 doesn't).
- Wired `musicSwitchTrack2to1` into `AskingState.execute`'s right-answer branch.
- Dropped the verbose music-switch debug logs (kept the behavior comment on the SFX-on-already-track-2 branch).
- Beat-align `delayedCall` math (`Math.min(beat, 1.5 - beat)`) preserved as-is; treating it as semantic choice, not a bug to fix in this refactor.

### 4. ~~Scene lifecycle~~ ✅
Landed:
- `shutdown()` stops both music tracks (the only thing Phaser doesn't auto-clean for us).
- Removed duplicate music-stop calls from `progressSus`'s game-over branch and the hand-vs-blocks collider — `shutdown()` is now the single source of cleanup truth, fired automatically by Phaser when `scene.start('GameOver')` runs.
- Pruned the three remaining duplicate state inits from `create()` (already in `init()`).
- Dropped two stale TODO comments that pointed at "should add init" and "move state to init" — both done.
- Verified clean restart end-to-end in headless browser.

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

- **Extract layout magic numbers to `config.ts`.** Bubble/scale/demon/skel positions, hand wrap thresholds, wall sizes — all layout-tied. Defer until v1.0 features (timer, loot bar, "загрузить вопросами", stash spots) have laid claim to screen real estate. Game-feel scalars (`HAND_SPEED`, `MUSIC_HALF_TACT_SECONDS`) already extracted; single-use timings (idle 2s, asking 3.9s, cooldown 5s, answer-stagger 700/800/900ms, loot respawn 1s) left inline next to their named call sites — naming wouldn't add clarity.
- **Dialogue-key home-row layout.** Answer keys lock onto QWERTY positions (`Phaser.Input.Keyboard.KeyCodes.S/D/F` + `O/E/U`) so layout switches (Dvorak, Colemak, etc.) don't move them off the home row. Current picks are SDF (left hand) and OEU (right hand). Teammates report ASD/JKL would feel more familiar than SDF. Probably worth revisiting after the v1.0 input model is settled — possibilities: ASD/JKL on left+right hand, or a settings toggle if QWERTY-trained vs. home-row-purist players both exist.

## Decided against

- **Splitting heist into Dialogue + Arcade scenes.** Inter-loop coupling (suspicion meter read by both, bubbles obscure the arcade area, stash state gates "look at table" events, single game-over) is by design — putting it across a `scene.launch` boundary turns class-field access into pub/sub ceremony without buying independent lifecycles. Internal FSMs (refactor 2) deliver the same cognitive isolation for free. Inter-*mode* scenes (heist vs. adventure map vs. menu) remain the right boundary.
- **Enabling `strictPropertyInitialization`.** Originally deferred "until refactor 2 lands and most ad-hoc fields disappear." Refactors 2-4 landed; the field count dropped, but ~20 fields still need late init via Phaser's `init()`/`create()` (scene plugins like `this.add`/`this.physics` aren't available at construction time). Flipping the flag would scatter 20 `!:` markers across the class for negligible safety gain — the bug class it catches (declared-but-never-written field) is already prevented by our `init()`/`create()` discipline, and the typo bugs we did hit were caught by plain `strict: true`. Keep it off.
