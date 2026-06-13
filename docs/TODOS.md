# TODOS.md

Open work items for `donkey-jam-2026`. v1.0/v2.0 feature backlog, bugs, deferred decisions. DESDOC.md remains the design narrative (Russian); items here are the actionable cut.

---

## v1.0 backlog (from DESDOC)

- оп смотрит на стол — **shipped 2026-06-12** (`LookAtTableState` in `dialogue-states.ts`). Sus 4 is no longer an instant GameOver: the demon leans over the table (placeholder composite sprite) with a red draining bar + "hide!" caption under it, the player has a 2s window to be stashed when the check fires; caught → GameOver, stashed → the whole sus bundle settles to baseline 1 with a hard music cut to track 2.
  - A hide DURING the reaction holds (its 1s auto-pop is suppressed until the check passes), so reaching the stash any time inside the 2s window is enough — the window is pure travel time, not a hide-at-the-right-instant puzzle (fixed 2026-06-13 after playtest: an early hide used to pop out and get caught). An accidental step outside the reaction still costs the normal 1s.
  - **Playtest watch-items:** a wall stun firing the alarm (stun at sus 3) is a near-certain death chain (1s frozen of the 2s window) — by design, verify it feels fair. (Both reactions ship now; which one fires is the `ALARM_REACTION_WEIGHTS` roll, now at the design 70/30 look/storm — see the загрузить-вопросами item below.)
- нычка руки — **prototype shipped 2026-06-11; art v2 + bottom-center placement 2026-06-12.** `HiddenState` in `hand-states.ts`, one stash hole at (635, 490) via `LEVELS[].stashSpots`, hole art from the user's second drop (alpha PNG resized to 120x120, `public/assets/hole.png`). Calls made in the prototype (revisit on playtest):
  - Touch → auto-hide 1s; cost = wasted level-timer time only (no loot/sus penalty). Resume continues the direction of travel (no bounce).
  - Re-trigger: auto-step-out — a zone re-arms only after the hand fully leaves it.
  - `Hidden` ⊥ `Stunned` confirmed: collider and overlap callbacks guard against each other.
  - Trigger zone = the solid hole interior (76x70), not the crack span.
  - **Playtest watch-items:** bottom center sits in the stun corridor — turning down near mid-table hides immediately and the pop-out runs into the bottom wall (hide → stun chain); if that feels punishing, nudge the spot or add a re-arm cooldown. Hide has no SFX/animation yet (sink-in tween + plop sound are open polish). Tile count per level and duration scaling still open.
  - Додж-ценность (задоджить взгляд) приехала вместе с look-at-table (2026-06-12).
- загрузить вопросами — **shipped 2026-06-13** (`StormState` in `dialogue-states.ts`). The sus-4 alarm now rolls one of two reactions (`ALARM_REACTION_WEIGHTS` + `rollAlarmReaction`): look-at-table or storm. Storm = question bubbles pile over the arcade for 3s (no check, no fail — lost time + blocked visibility; the hand keeps moving blind, a wall crash still stuns), then settles to baseline like look-at-table.
  - **Weights now at the design `{ lookAtTable: 0.70, storm: 0.30 }`** (`ALARM_REACTION_WEIGHTS`, set 2026-06-13 after the 100%-storm playtest). DEV key `4` cycles a forced reaction (roll / lookAtTable / storm) to test either regardless of the weights.
  - Bubbles are placeholder (`bubble-demon` sprite, 3x3 grid with jitter over the arcade); dedicated storm-bubble art swaps in at the same key (in flight from the artist).
- Integrate hand movement animation. The artist's GIF was completed during the jam but never wired into the sprite. Replace the static `'hand'` image with proper Phaser animation frames.

## v2.0 backlog (from DESDOC)

- adventure map

---

## Bugs

### B1. Hitboxes need tightening

**Where:** `src/game/scenes/MainGame.ts` — hand, blocks, sword block, loot.
The current arcade-physics hitboxes are rectangular and don't match the irregular sprite shapes well. Concrete cases need investigation per-sprite (likely `setSize` + `setOffset` tuning, or switching to per-sprite polygon hitboxes if the rectangular approximation is hopeless). DESDOC's "Подложка хитбоксов" item covers the _visualization_ of hitboxes; this item is the underlying _correctness_.

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

- **HP-on-collision alternative to stun.** Original DESDOC line was "стан / минус хп за врез" — pitched as either-or. We shipped stun; the HP variant (collision deducts from a hand health pool rather than freezing it) came from a teammate and might still be worth revisiting if stun ends up feeling too forgiving or if we want a second failure axis alongside the timer/suspicion meter. Not on any v1.0 path — park here in case the playtest signal calls for it.

- **Extract layout magic numbers to `config.ts`.** Bubble/scale/demon/skel positions, hand wrap thresholds (now in MainGame), wall sizes — all layout-tied. Defer until remaining v1.0 features that claim screen real estate ("загрузить вопросами", stash spots) have landed. Game-feel scalars (`HAND_SPEED`, `MUSIC_HALF_TACT_SECONDS`) already extracted; single-use timings (idle 2s, asking 3.9s, cooldown 5s, answer-stagger 700/800/900ms, loot respawn 1s) left inline next to their named call sites — naming wouldn't add clarity.
- **Dialogue-key home-row layout.** Answer keys lock onto QWERTY positions (`Phaser.Input.Keyboard.KeyCodes.S/D/F` + `O/E/U`) so layout switches (Dvorak, Colemak, etc.) don't move them off the home row. Current picks are SDF (left hand) and OEU (right hand). Teammates report ASD/JKL would feel more familiar than SDF. Probably worth revisiting after the v1.0 input model is settled — possibilities: ASD/JKL on left+right hand, or a settings toggle if QWERTY-trained vs. home-row-purist players both exist.

- **Doc-set audit — first pass complete (2026-05-13 → 2026-05-15); follow-ups parked.**
  - **Reviewed + cleaned this pass:** README.md, docs/DOC-MAP.md, gstack docs at `~/.gstack/projects/slick_hand_joe/` (status overlays applied, dep scope map retired, R2/R3/R4 status corrections in alarm-reactions design, crossfade + 6-track music decision recorded, etc.).
  - **Mostly good as-is:** docs/DESDOC.md — no edits this pass.
  - **To refactor in the next pass:** docs/ARCHITECTURE.md (style pass wanted; content is factually correct but stylistically wants rework — user flagged 2026-05-15), CLAUDE.md (this session's edits not deeply reviewed by user), docs/TODOS.md (this file itself).
  - **Phase B still parked:** DESDOC piece-by-piece status pass. Tag each section TRUSTED / STALE / OPEN. DESDOC is dense; bounded section-by-section review is the workaround. Each pass = one section; status-tagging makes verification explicit.
