# TODOS.md

Open work items for `donkey-jam-2026`. v1.0/v2.0 feature backlog, bugs, deferred decisions. DESDOC.md remains the design narrative (Russian); items here are the actionable cut.

---

## v1.0 backlog (from DESDOC)

- таймер на прохождение
- шкала лута
- оп смотрит на стол при заполнении подозрения
- нычка руки. при касании прячешься на секунду. можешь задоджить взгляд. а можешь проебать время если случайно наступил.
- загрузить вопросами
- стан / минус хп за врез (+ Hand FSM refactor — Up/Down/Left/Right + Stunned + Hidden states, reuse `src/lib/StateMachine.ts`)
- Integrate hand movement animation. The artist's GIF was completed during the jam but never wired into the sprite. Replace the static `'hand'` image with proper Phaser animation frames.

## v2.0 backlog (from DESDOC)

- adventure map

---

## Bugs

### B1. Hitboxes need tightening
**Where:** `src/game/scenes/MainGame.ts` — hand, blocks, sword block, loot.
The current arcade-physics hitboxes are rectangular and don't match the irregular sprite shapes well. Concrete cases need investigation per-sprite (likely `setSize` + `setOffset` tuning, or switching to per-sprite polygon hitboxes if the rectangular approximation is hopeless). DESDOC's "Подложка хитбоксов" item covers the *visualization* of hitboxes; this item is the underlying *correctness*.

### B2. Custom cursor too large for macOS
**Where:** `public/assets/menuUI/cursor.png` (110x110 post-rotation), referenced via `MENU_CURSOR` in `src/game/config.ts`.
macOS browsers silently reject custom cursors above ~32x32 (or ~64x64 retina) and fall back to OS default. Symptom: cursor CSS in devtools is correct, but the rendered cursor is the macOS arrow on hover transitions in MainMenu (and possibly elsewhere).
**Fix:** `convert cursor.png -resize 32x32 cursor.png`, then retune `MENU_CURSOR`'s hotspot proportionally (`18 15` on 110px → `~5 4` on 32px).

### B3. Turning into an obstacle grows the hitbox into it (instant death)
**Where:** `src/game/scenes/MainGame.ts` — `setSize` calls in the L/R/U/D direction-change handlers around the hand FSM in `update()`.
When the hand is moving parallel to an obstacle and the player turns 90°, the hand body swaps its short/long dimensions (e.g., 67-wide → 106-wide on a horizontal turn). The center stays put, so the body suddenly extends ±19.5 px further along the new long axis — if an obstacle is within 19.5 px of the hand center, it now overlaps the body, fires the hand-vs-block collider, stuns, and (on the alarm-reactions path) can kill.
Not terribly critical — happens only when the player is hugging an obstacle edge AND choosing to turn into it. Defer.
**Fix sketch:** before applying the new `setSize`, run a probe against the future AABB; if it intersects any obstacle, refuse the turn the same way the wrap-safe-zone guard refuses vertical turns when off-table.

---

## Deferred (revisit later)

- **Extract layout magic numbers to `config.ts`.** Bubble/scale/demon/skel positions, hand wrap thresholds (now in MainGame), wall sizes — all layout-tied. Defer until v1.0 features (timer, loot bar, "загрузить вопросами", stash spots) have laid claim to screen real estate. Game-feel scalars (`HAND_SPEED`, `MUSIC_HALF_TACT_SECONDS`) already extracted; single-use timings (idle 2s, asking 3.9s, cooldown 5s, answer-stagger 700/800/900ms, loot respawn 1s) left inline next to their named call sites — naming wouldn't add clarity.
- **Dialogue-key home-row layout.** Answer keys lock onto QWERTY positions (`Phaser.Input.Keyboard.KeyCodes.S/D/F` + `O/E/U`) so layout switches (Dvorak, Colemak, etc.) don't move them off the home row. Current picks are SDF (left hand) and OEU (right hand). Teammates report ASD/JKL would feel more familiar than SDF. Probably worth revisiting after the v1.0 input model is settled — possibilities: ASD/JKL on left+right hand, or a settings toggle if QWERTY-trained vs. home-row-purist players both exist.
