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

export enum Direction {
    Up,
    Down,
    Left,
    Right,
}

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

// Game-feel tuning.
export const HAND_SPEED: number = 300; // px/s
// Music tact is ~3s; switches happen on the half-tact for smoothness.
export const MUSIC_HALF_TACT_SECONDS: number = 1.5;

// Music track keys (asset names) named for what they mean in the game.
// v1.0 sus-coupled music progression (per the deferred design doc) will
// expand this from 2 tracks to ~4; these two remain valid as the calm/alarm
// endpoints of the eventual scale.
export const MUSIC_CALM = 'music1';   // pre-suspicion / safe vibe
export const MUSIC_ALARM = 'music2';  // suspicion-aware / tense

// Per-level configuration. v1.0 has one entry; multi-level work (adventure
// map, DESDOC TODO v2.0) expands this. Other passes add fields as they ship
// (level-timer pass adds `timer:`, etc.).
export interface LevelConfig {
    id: number;
    lootTarget: number;
}

export const LEVELS: LevelConfig[] = [
    { id: 1, lootTarget: 5 },
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
