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

// Stash hole sprite (public/assets/hole.png): 120x120 as shipped -- trimmed
// and downscaled from the user's 2500x2500 alpha PNG (v2 art, replaced the
// keyed HEIC original 2026-06-12); identify-verified.
export const HOLE_SIZE: Size = {
    width: 120,
    height: 120,
};

// Stash trigger zone -- the solid hole INTERIOR of the sprite, not the full
// crack span, so brushing the outer cracks doesn't swallow the hand.
// Measured on the source via alpha-threshold + erode: interior blob
// ~1601x1455 of 2493x2492 (64% x 58%), scaled to 120px -> ~77x70.
export const STASH_TRIGGER_SIZE: Size = {
    width: 76,
    height: 70,
};

// Game-feel tuning.
export const HAND_SPEED: number = 300; // px/s

// Hand sprite dimensions. The asset is 106x67 (long axis along the extended
// finger). The body swaps width/height when the hand rotates: horizontal
// (L/R) -> HAND_LONG_DIM x HAND_SHORT_DIM, vertical (U/D) -> swapped. Shared
// between MainGame (setSize / wrap math) and hand-states.ts (per-direction
// enter handlers). Single source of truth -- a hand-asset swap only needs
// to update these two numbers.
export const HAND_LONG_DIM: number = 106;
export const HAND_SHORT_DIM: number = 67;
// Music tact is ~3s; switches happen on the half-tact for smoothness.
export const MUSIC_HALF_TACT_SECONDS: number = 1.5;

// Suspicion-level lookup table -- the multi-binding slot for anything
// coupled to the suspicion meter (per ARCHITECTURE.md "State modeling").
// Carries music; sprite stages bind via MainGame.applySusStage(level)
// (escalation and settle want different music transitions, so a single
// setSusLevel(n) setter was rejected as-built). Index = current sus
// (0..3); sus 4 is the ALARM and has no row -- the reaction state owns
// the screen from alarm-fire to settle, and the sus-3 visuals/track
// hold underneath until the composer's reaction tracks land.
//
// Keys music1/music2 are the musician's delivered pieces; music3/music4
// are bass-boosted placeholder derivations of track 2 (regenerate via
// tools/sfx/boost_placeholders.sh) until the real compositions land --
// same tempo and length, so tact-aligned switches stay musical.
export interface SusLevelCfg {
    music: string;
}

export const SUS_LEVELS: SusLevelCfg[] = [
    { music: 'music1' },  // sus 0 -- calm; plays from level start only
    { music: 'music2' },  // sus 1 -- first slip; also the post-alarm baseline
    { music: 'music3' },  // sus 2 -- tense
    { music: 'music4' },  // sus 3 -- one mistake from busted
];

// Post-alarm settle level (DESDOC: "После 1го палева возвращается не до
// идеального состояния" -- surviving an alarm drops the whole sus-coupled
// bundle to this level, not to zero). Alarm-reactions design decision:
// baseline 1 of 4.
export const SUS_BASELINE = 1;

// Alarm reaction roll. Reaching full sus (4) fires one of two reactions:
// look-at-table (a stash check) or storm (загрузить вопросами -- bubbles
// bury the table, no check, just lost time + blocked visibility).
// Currently 100% storm for storm-mechanic playtest; production target is
// { lookAtTable: 0.70, storm: 0.30 } (a one-line flip once storm feels
// right). The DEV force-reaction toggle (key 4) overrides the roll.
export type AlarmReaction = 'lookAtTable' | 'storm';
export const ALARM_REACTION_WEIGHTS: Record<AlarmReaction, number> = {
    lookAtTable: 0.7,
    storm: 0.3,
};

// Weighted pick. `rand` is a 0..1 roll (injected so this stays pure and
// unit-testable); MainGame passes Math.random(). Falls to storm when the
// weights sum to 0 (a bad config -- better a harmless reaction than a throw).
export function rollAlarmReaction(weights: Record<AlarmReaction, number>, rand: number): AlarmReaction {
    const total = weights.lookAtTable + weights.storm;
    return rand * total < weights.lookAtTable ? 'lookAtTable' : 'storm';
}

// Per-level configuration. v1.0 has one entry; multi-level work (adventure
// map, DESDOC TODO v2.0) expands this. Other passes add fields as they ship
// (level-timer pass adds `timer:`, etc.).
export interface LevelConfig {
    id: number;
    lootTarget: number;
    timerSeconds: number;
    // Stash hole centers. Entering a hole's trigger zone auto-hides the hand
    // for ~1s (HiddenState) -- being hidden when the look-at-table check
    // fires is what survives an alarm; an accidental step just wastes
    // level-timer time.
    stashSpots: Pos[];
}

export const LEVELS: LevelConfig[] = [
    // Stash at bottom center (user direction 2026-06-12). Geometry: the
    // hand spawns at (640, 410) -- horizontal body bottom 443.5 -- so the
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
// game. Cursor.png is 32x32: macOS browsers silently reject custom
// cursors larger than ~32x32 (or ~64x64 retina) and fall back to the OS
// arrow, so the original 110x110 art was downscaled to 32x32.
//
// Hotspot (5, 4) is the pointing fingertip (hand points up-and-left, so
// the tip sits in the upper-LEFT of the silhouette). Derived by scaling
// the proven 110px hotspot (18, 15) by 32/110 -> (5.2, 4.4); confirmed
// by measurement to fall inside the 32px silhouette (its full-alpha
// top-left is (3, 2), its solid-threshold top-left (6, 5)).
//
// History: on the 110px art, hotspot (55, 15) was the canvas top-center,
// ~40px RIGHT of the fingertip -- clicks landed ~one button-width left of
// the target. Big MainMenu buttons absorbed it within their hit area, so
// the misalignment only surfaced on the Settings scene's 40x40 +/-
// buttons. (18, 15) fixed it on the old art; (5, 4) is its 32px scale.
export const MENU_CURSOR = 'url(assets/menuUI/cursor.png) 5 4, pointer';

// -- MainGame scene layout -----------------------------------------------
// Positional constants extracted from MainGame.create() / showAskingUI
// (2026-06-13, once storm + stash claimed their screen space). Pure layout
// -- values are byte-identical to the former inline literals. Game-feel
// scalars (HAND_SPEED, MUSIC_HALF_TACT_SECONDS) and single-use timings stay
// inline at their call sites. Hand wrap/safe-zone thresholds already derive
// from ARCADE_AREA_LAYOUT in hand-states.ts, so they aren't repeated here.

// Characters + suspicion HUD. Skeleton (player) on the left, demon (victim)
// on the right; SKEL_POS doubles as the player speech-bubble anchor.
export const SKEL_POS: Pos = { x: 200, y: 400 };
export const DEMON_POS: Pos = { x: 1100, y: 410 };
export const SUS_METER_POS: Pos = { x: 1100, y: 50 };
export const LOOK_OVER_POS: Pos = { x: 1100, y: 200 };
export const LOOK_OVER_SCALE: number = 0.75;

// Dialogue bubbles + answer-emoji layout (enemy bubble + question on the
// right; the three answer emojis render in the player bubble on the left).
export const BUBBLE_ENEMY_POS: Pos = { x: GAME_WIDTH - 200, y: 400 };
export const QUESTION_IMAGE_POS: Pos = { x: GAME_WIDTH - 200, y: 430 };
export const ANSWER_POSITIONS: Pos[] = [
    { x: 150, y: 395 },
    { x: 280, y: 380 },
    { x: 220, y: 460 },
];

// Hand spawn -- screen center, nudged down so it starts on the table rather
// than inside the top wall.
export const HAND_SPAWN: Pos = { x: SCREEN_CENTER.x, y: SCREEN_CENTER.y + 50 };

// Walls + sword obstacle (arcade boundaries the hand stuns on). Rectangles
// are center + size. The sword sprite is 60x161 native, rotated 90deg ->
// 161x60 in world.
export const TOP_WALL: GameObjLayout = { x: SCREEN_CENTER.x, y: 1, width: 600, height: 100 };
export const BOTTOM_WALL: GameObjLayout = { x: SCREEN_CENTER.x, y: GAME_HEIGHT - 120, width: 600, height: 100 };
export const SWORD_BLOCK: GameObjLayout = { x: ARCADE_AREA_CENTER.x, y: 200, width: 161, height: 60 };

// Timer card (behind the countdown text, over the bottom wall) + the
// bottom-right control buttons.
export const TIMER_CARD: GameObjLayout = { x: SCREEN_CENTER.x, y: 630, width: 220, height: 100 };
export const PAUSE_BTN_POS: Pos = { x: GAME_WIDTH - 50, y: GAME_HEIGHT - 50 };
export const MUTE_BTN_POS: Pos = { x: GAME_WIDTH - 130, y: GAME_HEIGHT - 50 };
