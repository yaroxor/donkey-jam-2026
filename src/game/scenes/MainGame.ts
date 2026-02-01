import { Scene } from 'phaser';

import { GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';

interface Pos {
    x: number,
    y: number
}

interface GameObjPos {
    x: number,
    y: number,
    width: number,
    height: number
}

enum Direction {
  Up,
  Down,
  Left,
  Right,
}

function getLootRandomPos(arcadeArea: GameObjPos): Pos {
    const x = Math.random() * arcadeArea.width + arcadeArea.x;
    const y = Math.random() * arcadeArea.height + arcadeArea.y;
    const lootPos = { x: x, y: y};
    return lootPos;
}

export class MainGame extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    layout: Phaser.GameObjects.Image;
    arcadeAreaCoords: GameObjPos;
    arcadeArea: Phaser.GameObjects.Rectangle;

    blocks: Phaser.Physics.Arcade.Group;
    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    handMoveDirection: Direction;

    isLoot: boolean;
    loot: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

    constructor ()
    {
        super('MainGame');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff00ff);

        const ARCADE_AREA_CENTER: Pos = {
            x: (SCREEN_CENTER.x - 5),
            y: (GAME_HEIGHT/3 + 55)
        }
        const ARCADE_AREA_SIZE = {
            width: 550,
            height: 550
        }
        const ARCADE_AREA_TOP_LEFT_CORNER: Pos = {
            x: ARCADE_AREA_CENTER.x - ARCADE_AREA_SIZE.width/2,
            y: ARCADE_AREA_CENTER.y - ARCADE_AREA_SIZE.height/2
        }

        this.arcadeAreaCoords = { x: ARCADE_AREA_TOP_LEFT_CORNER.x, y: ARCADE_AREA_TOP_LEFT_CORNER.y, width: ARCADE_AREA_SIZE.width, height: ARCADE_AREA_SIZE.height };
        this.physics.world.setBounds(this.arcadeAreaCoords.x, this.arcadeAreaCoords.y, this.arcadeAreaCoords.width, this.arcadeAreaCoords.height);

        this.layout = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'level-layout');

        this.arcadeArea = this.add.rectangle(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y, ARCADE_AREA_SIZE.width, ARCADE_AREA_SIZE.height, 0xcccc33, 1);
        this.arcadeArea.setAlpha(0.5);

        // this.blocks = this.physics.add.group({ immovable: true });
        // const BLOCK_1_POS = {x: 500, y: 500}
        // this.blocks.create(BLOCK_1_POS.x, BLOCK_1_POS.y, 'blue');
        const block =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y - 100, 'blue');
        const BLOCK_SIZE = {
            width: 200,
            height: 30
        }
        block.setDisplaySize(BLOCK_SIZE.width, BLOCK_SIZE.height);
        block.setImmovable(true);

        this.isLoot = false;

        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 100, 'hand');
        this.hand.setCollideWorldBounds(true);
        this.handMoveDirection = Direction.Left;

        this.physics.add.collider(block, this.hand, () => {
            this.scene.start('GameOver');
        });

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        if (!this.isLoot) {
            const lootPos: Pos = getLootRandomPos(this.arcadeAreaCoords);
            this.loot = this.physics.add.sprite(lootPos.x, lootPos.y, 'coins');
            this.physics.add.collider(this.loot, this.hand, () => {
                this.loot.destroy();
                this.isLoot = false;
            });
            this.isLoot = true;
        }

        if (this.cursors.left.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Left;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-300);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.handMoveDirection == Direction.Right || this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Right;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(300);
            }
        }
        else if (this.cursors.up.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Up;
                this.hand.setSize(50, 100);
                this.hand.angle = 90;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(-300);
            }
        }
        else if (this.cursors.down.isDown) {
            if (this.handMoveDirection == Direction.Down || this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Down;
                this.hand.setSize(50, 100);
                this.hand.angle = 270;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(300);
            }
        }
    }

    shutdown()
    {
        // TODO: cleanup
    }
}
