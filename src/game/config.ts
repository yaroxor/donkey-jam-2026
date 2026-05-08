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

export class GameState {
  private music12Switched: boolean;
  private music21Switched: boolean;
  private dialogueGoing: boolean;
  private timeOfDialogueStart: number;
  private timeOfDialogueEnd: number;
  private currentSus: number;
  private susProgressED: boolean;
  private scales: Phaser.GameObjects.Group;
  private demons: Phaser.GameObjects.Group;
  private skels: Phaser.GameObjects.Group;
  private handMoveDirection: Direction;
  private lootAmount: number;
  private collectedLootCount: number;

  constructor(
    scales: Phaser.GameObjects.Group,
    demons: Phaser.GameObjects.Group,
    skels:  Phaser.GameObjects.Group,
  ) {
    this.music12Switched     = false;
    this.music21Switched     = true;
    this.dialogueGoing       = false;
    this.timeOfDialogueStart = Number.MAX_VALUE;
    this.timeOfDialogueEnd   = Number.MAX_VALUE;
    this.currentSus          = 0;
    this.susProgressED       = false;
    this.scales              = scales;
    this.demons              = demons;
    this.skels               = skels;
    this.handMoveDirection   = Direction.Left;
    this.lootAmount          = 0;
    this.collectedLootCount  = 0;
  }

  get isDialogueGoing()   { return this.dialogueGoing; }
  get isMusic12Switched() { return this.music12Switched; }
  get isMusic21Switched() { return this.music21Switched; }

  progressSus() {
    if (this.susProgressED) {
      console.log('~~~ in progressSus body, SUS already progressed -- Abort');
      return;
    }

    this.susProgressED = true;
    console.log(`~~~ sus progressed was set to ${this.susProgressED}`);

    let scale = this.scales.children.entries[this.currentSus] as Phaser.GameObjects.Sprite;
    let demon = this.demons.children.entries[this.currentSus] as Phaser.GameObjects.Sprite;
    let skel  = this.skels.children.entries[this.currentSus]  as Phaser.GameObjects.Sprite;

    scale.setAlpha(0);
    demon.setAlpha(0);
    skel.setAlpha(0);

    this.currentSus += 1;
    console.log(`After increment CURRENT SUS: ${this.currentSus}`);

    if (this.currentSus >= 4) return; // FAIL by SUS

    scale = this.scales.children.entries[this.currentSus] as Phaser.GameObjects.Sprite;
    demon = this.demons.children.entries[this.currentSus] as Phaser.GameObjects.Sprite;
    skel  = this.skels.children.entries[this.currentSus]  as Phaser.GameObjects.Sprite;

    scale.setAlpha(0);
    demon.setAlpha(0);
    skel.setAlpha(0);

    console.log('SUS Progressed');
  }
}
