export const GAME_WIDTH: number = 1280;
export const GAME_HEIGHT: number = 720;

export interface Pos {
    x: number,
    y: number,
}

export interface Size {
    width: number,
    height: number,
}

export interface GameObjLayout extends Pos, Size {}

export const SCREEN_CENTER: Pos = {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
};

export const ARCADE_AREA_CENTER: Pos = {
    x: SCREEN_CENTER.x - 5,
    y: GAME_HEIGHT / 3 + 35,
};

const arcadeAreaSize: Size = {
    width: 500,
    height: 380,
};

export const ARCADE_AREA_LAYOUT: GameObjLayout = {
    x: ARCADE_AREA_CENTER.x - arcadeAreaSize.width / 2,
    y: ARCADE_AREA_CENTER.y - arcadeAreaSize.height / 2,
    width: arcadeAreaSize.width,
    height: arcadeAreaSize.height,
};

export const LOOT_SIZE: Size = {
    width: 55,
    height: 61,
};

// Stash hole sprite (public/assets/hole.png): 120x120 as shipped — trimmed
// and downscaled from the user's 2500x2500 alpha PNG (v2 art, replaced the
// keyed HEIC original 2026-06-12); identify-verified.
export const HOLE_SIZE: Size = {
    width: 120,
    height: 120,
};

// Stash trigger zone — the solid hole INTERIOR of the sprite, not the full
// crack span, so brushing the outer cracks doesn't swallow the hand.
// Measured on the source via alpha-threshold + erode: interior blob
// ≈1601x1455 of 2493x2492 (64% x 58%), scaled to 120px → ≈77x70.
export const STASH_TRIGGER_SIZE: Size = {
    width: 76,
    height: 70,
};

// Game-feel tuning.
export const HAND_SPEED: number = 300; // px/s

// Hand sprite dimensions. The asset is 106x67 (long axis along the extended
// finger). The body swaps width/height when the hand rotates: horizontal
// (L/R) → HAND_LONG_DIM × HAND_SHORT_DIM, vertical (U/D) → swapped. Shared
// between MainGame (setSize / wrap math) and hand-states.ts (per-direction
// enter handlers). Single source of truth — a hand-asset swap only needs
// to update these two numbers.
export const HAND_LONG_DIM: number = 106;
export const HAND_SHORT_DIM: number = 67;
// Music tact is ~3s; switches happen on the half-tact for smoothness.
export const MUSIC_HALF_TACT_SECONDS: number = 1.5;

// Suspicion-level lookup table — the multi-binding slot for anything
// coupled to the suspicion meter (per ARCHITECTURE.md "State modeling").
// v1.0 binds music only; sprite-stage selection still lives in the
// progressSus image arrays and migrates here when setSusLevel(n) lands
// with alarm reactions. Index = current sus (0..3); sus 4 is GameOver and
// has no row (when alarm reactions ship, the reaction states own music
// from alarm-fire to settle).
//
// Keys music1/music2 are the musician's delivered pieces; music3/music4
// are bass-boosted placeholder derivations of track 2 (regenerate via
// tools/sfx/boost_placeholders.sh) until the real compositions land —
// same tempo and length, so tact-aligned switches stay musical.
export interface SusLevelCfg {
    music: string;
}

export const SUS_LEVELS: SusLevelCfg[] = [
    { music: 'music1' },  // sus 0 — calm; plays from level start only
    { music: 'music2' },  // sus 1 — first slip
    { music: 'music3' },  // sus 2 — tense
    { music: 'music4' },  // sus 3 — one mistake from busted
];

// Per-level configuration. v1.0 has one entry; multi-level work (adventure
// map, DESDOC TODO v2.0) expands this. Other passes add fields as they ship
// (level-timer pass adds `timer:`, etc.).
export interface LevelConfig {
    id: number;
    lootTarget: number;
    timerSeconds: number;
    // Stash hole centers. Entering a hole's trigger zone auto-hides the hand
    // for ~1s (HiddenState) — dodge value arrives with the look-at-table
    // mechanic; until then the cost is wasted level-timer time.
    stashSpots: Pos[];
}

export const LEVELS: LevelConfig[] = [
    // Stash at bottom center (user direction 2026-06-12). Geometry: the
    // hand spawns at (640, 410) — horizontal body bottom 443.5 — so the
    // trigger zone's top edge (490 - 70/2 = 455) must stay below that or
    // the level starts with an instant hide. At y=490 the clearance is
    // 11.5px, and the 120px sprite's bottom rests at the bottom danger-tape
    // edge (~550).
    { id: 1, lootTarget: 5, timerSeconds: 60, stashSpots: [{ x: 635, y: 490 }] },
];

// Current level index. Hardcoded for v1.0 single-level; becomes scene state
// when multi-level work lands. Callers should access via
// `LEVELS[CURRENT_LEVEL_INDEX]`.
export const CURRENT_LEVEL_INDEX = 0;

// Loot meter HUD layout. Anchor is the top-left corner of the first cell
// (createLootMeter sets origin (0, 0) on each rectangle). Position chosen
// to clear the arcade-area zone where storm bubbles will eventually render
// (per the deferred alarm-reactions design's premise 6).
export const LOOT_METER_ANCHOR: Pos = { x: 50, y: 30 };
export const LOOT_METER_CELL_WIDTH: number = 30;
export const LOOT_METER_CELL_HEIGHT: number = 30;
export const LOOT_METER_CELL_GAP: number = 4;
// Cells per row before wrapping to a new row below. Keeps the HUD compact at
// high loot targets (the DEV tuner allows up to 25); production targets are
// well under this so wrap doesn't trigger in shipped builds.
export const LOOT_METER_ROW_LENGTH: number = 7;
// Visual style. Tune in playtest. Sprite swap (when artist delivers the
// loot-meter art per DESDOC line 28) replaces the rectangle fills with
// textures; these color constants become unused at that point.
export const LOOT_METER_FILL_COLOR: number = 0xffcc00;   // gold filled cell
export const LOOT_METER_EMPTY_COLOR: number = 0x222222;  // dark empty cell
export const LOOT_METER_STROKE_COLOR: number = 0x44323f; // matches HUD palette

// CSS cursor for the menu skeletal-hand cursor. Used everywhere in the
// game. Cursor.png is 110x110; the opaque hand silhouette lives in canvas
// coords (18, 15) to (100, 87) per `convert -trim` measurement, with the
// pointing fingertip in the upper-LEFT of that box (hand points up-and-
// left). Hotspot (18, 15) puts the click-registration point at the
// visible fingertip.
//
// The earlier hotspot (55, 15) was the top-center of the canvas — ~40px
// RIGHT of the actual fingertip — which made small interactive elements
// feel offset by ~one button width left (user had to point left of a
// target to land a click on it). Big MainMenu buttons absorbed the
// offset within their hit area, so the misalignment only surfaced on
// the Settings scene's 40x40 +/- buttons.
export const MENU_CURSOR = 'url(assets/menuUI/cursor.png) 18 15, pointer';
