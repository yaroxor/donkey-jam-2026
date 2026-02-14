export enum Direction {
  Up,
  Down,
  Left,
  Right,
}

export interface Pos {
  x: number,
  y: number
};

interface Size {
  width: number,
  height: number
}

export interface GameObjLayout extends Pos, Size {}

export const GAME_WIDTH: number = 1280;
export const GAME_HEIGHT: number = 720;

export const SCREEN_CENTER: Pos = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT / 2
}

export const ARCADE_AREA_CENTER: Pos = {
    x: (SCREEN_CENTER.x - 5),
    y: (GAME_HEIGHT/3 + 35)
}
const arcadeAreaSize: Size = {
    width:  500,
    height: 380
}
const arcadeAreaTopLeftCorner: Pos = {
    x: ARCADE_AREA_CENTER.x - arcadeAreaSize.width/2,
    y: ARCADE_AREA_CENTER.y - arcadeAreaSize.height/2
}
export const ARCADE_AREA_LAYOUT: GameObjLayout = {
  x:      arcadeAreaTopLeftCorner.x,
  y:      arcadeAreaTopLeftCorner.y,
  width:  arcadeAreaSize.width,
  height: arcadeAreaSize.height
}

export const LOOT_SIZE: Size = {
  width:  55,
  height: 61 
}
