# DOC-MAP.md

Living inventory of the `slick_hand_joe` doc-set. Two scopes covered:

1. **In-repo**
2. **gstack per-feature docs** at `~/.gstack/projects/slick_hand_joe/`

---

## In-repo

```
CLAUDE.md
  repo-scoped model-specific instructions (auto-loaded)
↓
README.md
  quick onboarding: game pitch, dev quickstart, etc.
↓
docs/DOC-MAP.md
  this file. living inventory
↓
docs/DESDOC.md
  game design source of truth. Russian, hand-authored, long-form narrative.
  Contents: concept, lore, gameplay rules (lose conditions, win conditions,
  dialogue mechanic, alarm storm), future-level ideas
↓
docs/ARCHITECTURE.md
  cross-cutting patterns + rationale + rejected designs
↓
docs/TODOS.md
  actionable backlog. Sections: v1.0 backlog, v2.0 (adventure map), bugs,
  deferred decisions
```

Outside the reading chain:

- `tools/sfx/README.md` — Python audio-synth subsystem onboarding. Read if music / SFX generation is needed.
- `LICENSE` — MIT; upstream copyright is Phaser TS template's

---

## gstack per-feature docs

Produced by gstack skills (`/office-hours`, `/plan-eng-review`, etc.) and stored outside the repo at `~/.gstack/projects/slick_hand_joe/`. Auto-discovered by subsequent gstack runs.

**Provenance: advisory at best.** These docs are model-authored and wordy enough that they were never fully human-reviewed (user direction, 2026-06-11). Treat their contents — including "pre-decided" reductions — as proposals to surface and confirm, not settled decisions. Dated overlays (`## Implementation note` / `## Status update`) supersede doc bodies wherever they conflict.

### Design / plan docs

| File                                                 | Topic                                   | Declared status                             | Reality (2026-05-14)                                                                                                                                                                                                         |
| ---------------------------------------------------- | --------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-master-design-20260509-083149.md`               | Alarm reactions (storm + look-at-table) | ON HOLD                                     | Deps mostly cleared (stun, loot meter, level timer shipped; music progression has approved plan; stash spots still v1.0 open). Doc body still useful — R1-R4 reductions are pre-decided and carry forward when work resumes. |
| `dev-master-design-20260511-121959.md`               | Dep scope map (alarm reactions deps)    | RETIRED 2026-05-14                          | Navigation role fulfilled. Pre-thinking for the remaining un-designed node (stash spots) migrated to `TODOS.md`. Body preserved as historical record.                                                                        |
| `dev-master-design-20260511-123429.md`               | Music progression (sus-coupled 4-track) | APPROVED                                    | Not shipped. 2-track stub still in production. The `SUS_LEVELS` table proposed here is now endorsed as a multi-binding architectural slot beyond music's needs (see `ARCHITECTURE.md`).                                      |
| `dev-master-design-20260511-155307.md`               | Loot meter (segmented HUD + LEVELS)     | SHIPPED 2026-05-11 (`71bd8af`)              | Status updated 2026-05-13. Implementation note in doc body. Sprite swap still pending art.                                                                                                                                   |
| `dev-master-design-20260511-183443.md`               | Settings menu + in-game mute            | SHIPPED 2026-05-12 (`624f127`)              | Status updated 2026-05-13. Implementation note in doc body.                                                                                                                                                                  |
| `dev-master-eng-review-test-plan-20260511-113314.md` | Alarm reactions playtest checklist      | ON HOLD                                     | Derivative of alarm-reactions design; resumes alongside it.                                                                                                                                                                  |
| `dev-master-plan-stun-20260512-105430.md`            | Stun mechanic + Hand FSM refactor       | SHIPPED 2026-05-12 (PR #2, merge `f511358`) | Status updated 2026-05-13. Implementation note in doc body. `Hidden` state correctly remains deferred.                                                                                                                       |

### Metadata logs (`.jsonl`)

Not human-readable design content — gstack runtime state.

- `learnings.jsonl` — accumulated learnings surfaced by `/learn`-routed skills.
- `timeline.jsonl` — per-event timestamps.
- `master-reviews.jsonl` — log of `/plan-*-review` runs against master.
- `featstun-mechanic-reviews.jsonl` — log of review runs against the `feat/stun-mechanic` branch.
