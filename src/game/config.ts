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

// CSS cursor for the menu skeletal-hand cursor. Used everywhere in the
// game. Hotspot 55 15 approximates the index-finger tip on the 110x110
// cursor.png (post-45°-CW rotation); tune if click point feels off.
export const MENU_CURSOR = 'url(assets/menuUI/cursor.png) 55 15, pointer';
