# REFACTOR.md

Active refactor + bug backlog for `donkey-jam-2026`. Iterate against this; check items off as they land; delete the file when it's empty.

Pattern of choice for entity state: Osmose-style FSM. Tutorial archived at `phaser-statemichne-tutorial.md` in repo root.

---

## Bugs

### 1. Silent typo: `timeDialogueStrat`
**Where:** `src/game/scenes/MainGame.ts:347`, in `init()`.
**What:** Writes to `this.timeDialogueStrat` but the declared field is `timeOfDialogueStart`. JS silently creates a new property; `timeOfDialogueStart` never gets reset between scenes.
**Caught by:** strict TS (refactor item 1). Field disappears entirely once dialogue FSM (item 2) lands.

### 2. Silent typo: `currentDemon`
**Where:** `src/game/scenes/MainGame.ts:316`, in `progressSus()`.
**What:** `this.currentDemon += 1` — `currentDemon` is not declared on the class. Silently creates a property nothing else reads. The intent was probably to advance the demon sprite group in parallel with `currentSus`, but the actual demon-image swap is already happening on lines 312–314 indexed by `currentSus`. Either delete the line or wire it up properly.

### 3. `getLootRandomPos` bounds — multiple issues
**Where:** `src/game/scenes/MainGame.ts:110–131`.
- Line 115: y range uses `arcadeAreaCoords.width` where it should use `height`.
- Line 124: `(block1LeftX > x > block1RightX)` is JS-legal but evaluates as `(block1LeftX > x) > block1RightX` — boolean compared to a number. Never matches the intended "x is inside the block." Same shape on the Y check. Fix with `&&` chains.
- Line 125: references `this.arcadeAreaCoordsCenter`, not declared on the class. Would crash if the broken condition ever matched.

### 4. Empty `shutdown()`
**Where:** `src/game/scenes/MainGame.ts:632`.
Music keeps playing across scenes; `delayedCall` timers keep firing into a dead scene; colliders pile up.

### 5. Restart broken
**Where:** `src/game/scenes/MainGame.ts:359` (`create()`).
Only `music1`/`music2` are guarded with `if (!)`. Re-entering MainGame after GameOver stacks groups, sprites, and colliders. Same root cause as the TODO at line 107.
**Fix:** Move state init from `create()` into `init()`.

### 6. Polled `isDown` instead of `JustDown`
**Where:** `src/game/scenes/MainGame.ts:543, 552`.
`key.isDown` is true every frame the key is held — one wrong-answer press fires `answerFail` many times. The `susProgressED` latch (lines 88, 297) exists only to suppress this. `Phaser.Input.Keyboard.JustDown(key)` fires once per physical press; latch becomes unnecessary.

### 7. Contradictory music flags
**Where:** `src/game/scenes/MainGame.ts:81–82, 257, 277–278, 370`.
`music12Switched` and `music21Switched` are independent booleans. Both-true is meaningless (line 370 has `// imean track 1 is already playing` to disambiguate the contradictory init).
**Fix:** `currentMusicTrack: 1 | 2`.

### 8. `Number.MAX_VALUE` time sentinels
**Where:** `src/game/scenes/MainGame.ts:182, 347, 348`.
`1.7976931348623157E+308` as "no dialogue active" sentinel. Removed by refactor item 2 — `state === 'idle'` becomes the real signal.

---

## Refactors

### 1. Strict TypeScript
`tsconfig.json` — enable `strict` (or at minimum `noImplicitAny` + `strictPropertyInitialization` + `strictNullChecks`). Catches bugs 1, 2, and most of 3 at compile time.

### 2. Dialogue state machine
- Add `src/game/StateMachine.ts` — Osmose's pattern ported to TS. String-literal union for state names; generic `stateArgs`; include an `exit()` hook (the tutorial mentions it but doesn't show it — we want it).
- States: `idle | asking | cooldown`.
- Replaces: `isDialogueGoing`, `susProgressED`, `timeOfDialogueStart`, `timeDialogueEnd`, `timeDialogueStrat` typo.
- Time-driven transitions: use `scene.time.delayedCall` from `enter()` (auto-cleared on scene shutdown), not elapsed-time checks in `execute()`.

### 3. Music state
`currentMusicTrack: 1 | 2` field; `musicSwitchTrack1to2` / `musicSwitchTrack2to1` read & set it. Could later be its own tiny FSM with beat-aligned transitions in `enter()`.

### 4. Scene lifecycle
- All state init in `init()`, not `create()`.
- `shutdown()` stops both music tracks, removes colliders, drops references to pending timers.

### 5. JustDown for dialogue keys
Switch dialogue answer reads (`update()` lines 543, 552) to `Phaser.Input.Keyboard.JustDown`.

---

## Deferred (revisit later)

- **Hand FSM.** Reuse `StateMachine.ts` from refactor 2. States: Up/Down/Left/Right + future Stunned + Hidden. Wait until v1.0 stun TODO is in flight.
- **Sub-scene split.** Dialogue scene + Arcade scene in parallel via `scene.launch`. Wait until v1.0 features are in and the seams are obvious.
- **Extract magic numbers to `config.ts`.** Many positions/sizes/timings repeat in `MainGame.ts`. Defer until layout is stable.
