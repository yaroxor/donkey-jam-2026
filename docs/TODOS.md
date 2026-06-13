# TODOS.md

Open work items for `donkey-jam-2026`. v1.0/v2.0 feature backlog, bugs, deferred decisions. DESDOC.md remains the design narrative (Russian); items here are the actionable cut.

---

## v1.0 backlog (from DESDOC)

- Integrate hand movement animation. The artist's GIF was completed during the jam but never wired into the sprite. Replace the static `'hand'` image with proper Phaser animation frames. (Asset still missing from the repo — see Pending assets.)
- **Wrong-answer pool — semantic duplicates** (moved from DESDOC Фиксы). Distractors sometimes plausibly answer the question, making it ambiguous. Constrain per-question wrong-answer pools or group items by category. Built in `MainGame.showAskingUI` (`emojis.filter(...)` picks the two wrongs).
- **Убрать клетки** (moved from DESDOC Фиксы) — remove the visible grid/cell lines from the board (in `table.png` art, or a grid overlay if drawn in code — confirm source). Primarily an art fix.

## v2.0 backlog (from DESDOC)

- adventure map
- **Опционально (story / extra content, moved from DESDOC):**
  - [ ] Доп. уровни
  - [ ] Мини история про то, как Джо попал в Ад
  - [ ] Финал диалог с Сатаной
- **Идеи для новых уровней (moved from DESDOC)** — fodder for the adventure map:
  - масштаб становится меньше
  - падают новые препятствия (предупреждают тенью)
  - булетхел с соплями
  - порталы вместо оборота игрового поля (сначала подобрать ключ от портала)
  - сабвейсерв вместо змейки
  - иностранец

---

## Bugs

### B1. Hitboxes need tightening

**Where:** `src/game/scenes/MainGame.ts` — hand, blocks, sword block, loot.
The current arcade-physics hitboxes are rectangular and don't match the irregular sprite shapes well. Concrete cases need investigation per-sprite (likely `setSize` + `setOffset` tuning, or switching to per-sprite polygon hitboxes if the rectangular approximation is hopeless). This is hitbox _correctness_; the hitbox _visualization_ (the jagged red danger-tape underlay) is already implemented.

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

## Pending assets

Everything here runs on a committed placeholder today; the real asset swaps in at the same key with no code change (or the small change noted).

**Art (visual artist):**

- **Storm bubbles** — placeholder is the plain `bubble-demon` sprite tiled over the arcade; want dedicated question-storm bubble art.
- **Look-over demon** — placeholder composite (`tools/art/compose_look_over.sh`: demon #4 tilted + the spring-eyes drop); want the real "leaning over the table" pose.
- **Loot meter** — placeholder colored rectangles; want empty/filled cell art (the `LOOT_METER_*_COLOR` constants become unused then).
- **Win screen** — placeholder "YOU WIN!" text (`Win.ts`); want win art.
- **Mute button** — placeholder 🔊/🔇 emoji; want a menuUI icon.
- **Hand movement animation** — the jam GIF, to wire as Phaser frames (replaces the static `hand.png`); never landed in the repo. (Also a v1.0 code task.)
- **Убрать клетки** — remove the board grid cells. (Also in v1.0 backlog.)

**Music (composer):**

- **Tracks 3 & 4 (critical path)** — currently bass-boosted fakes of track 2 (`tools/sfx/boost_placeholders.sh`); want real escalation tracks. Hard constraint: **same BPM + tact structure as tracks 1 & 2** — `MusicController.smoothSwitch` carries the seek position across a 1.5s half-tact boundary, so mismatched tempo desyncs. Swap at Preloader keys `music3` / `music4`.
- **Tracks 5 & 6 (optional, not wired)** — per-reaction tracks (storm / look-at-table), designed in the gstack doc but with no callsite yet. Only needed if we decide to score the reactions; today the alarm rides track 4 and hard-cuts to baseline on settle.
- **~200ms crossfade on track switches** — see Deferred below.

---

## Deferred (revisit later)

- **~200ms music crossfade on sus-track switches.** Today the switcher hard-cuts between tracks at the half-tact beat boundary (track A stops, track B starts at the carried seek position). The music-progression design's overlay calls for overlapping them ~200ms instead — fade A down while fading B up — to hide timbre/dynamic seams between dissimilar real tracks. Deferred until real tracks 3/4 land: the current placeholders are the same song, so hard cuts are already seamless and a fade would be tuned against throwaway audio. ~10 lines in `MusicController.smoothSwitch` (a Phaser tween on `setVolume` within the existing `delayedCall` window); dial toward 0ms if it muddies. Source: `~/.gstack/projects/slick_hand_joe/dev-master-design-20260511-123429.md`.

- **HP-loss-on-collision alternative to stun.** Original DESDOC line was "стан / минус хп за врез" — pitched as either-or. We shipped stun; the HP variant (collision deducts from a hand health pool rather than freezing it) came from a teammate and might still be worth revisiting if stun ends up feeling too forgiving or if we want a second failure axis alongside the timer/suspicion meter. Not on any v1.0 path — park here in case the playtest signal calls for it.

- **Dialogue-key home-row layout.** Answer keys lock onto QWERTY positions (`Phaser.Input.Keyboard.KeyCodes.S/D/F` + `O/E/U`) so layout switches (Dvorak, Colemak, etc.) don't move them off the home row. Current picks are SDF (left hand) and OEU (right hand). Teammates report ASD/JKL would feel more familiar than SDF. Probably worth revisiting after the v1.0 input model is settled — possibilities: ASD/JKL on left+right hand, or a settings toggle if QWERTY-trained vs. home-row-purist players both exist.

- **Doc-set audit — first pass complete (2026-05-13 → 2026-05-15); follow-ups parked.**
  - **Reviewed + cleaned this pass:** README.md, docs/DOC-MAP.md, gstack docs at `~/.gstack/projects/slick_hand_joe/` (status overlays applied, dep scope map retired, R2/R3/R4 status corrections in alarm-reactions design, crossfade + 6-track music decision recorded, etc.).
  - **Mostly good as-is:** docs/DESDOC.md — no edits this pass.
  - **To refactor in the next pass:** docs/ARCHITECTURE.md (style pass wanted; content is factually correct but stylistically wants rework — user flagged 2026-05-15), CLAUDE.md (this session's edits not deeply reviewed by user), docs/TODOS.md (this file itself).
  - **Phase B still parked:** DESDOC piece-by-piece status pass. Tag each section TRUSTED / STALE / OPEN. DESDOC is dense; bounded section-by-section review is the workaround. Each pass = one section; status-tagging makes verification explicit.
