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
    lootCount: number;
    lootScoreMsg: Phaser.GameObjects.Text;

    constructor ()
    {
        super('MainGame');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff00ff);

        // TODO?: move this stuff into config
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

        this.layout = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'level-layout');

        this.arcadeArea = this.add.rectangle(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y, ARCADE_AREA_SIZE.width, ARCADE_AREA_SIZE.height, 0xcccc33, 1);
        this.arcadeArea.setAlpha(0.5);

        this.blocks = this.physics.add.group({ immovable: true });
        const block1 =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y - 100, 'blue');
        const BLOCK1_SIZE = {
            width: 200,
            height: 30
        }
        block1.setDisplaySize(BLOCK1_SIZE.width, BLOCK1_SIZE.height);
        this.blocks.add(block1);
        const block2 =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, 40, 'blue');
        const BLOCK2_SIZE = {
            width: 550,
            height: 30
        }
        block2.setDisplaySize(BLOCK2_SIZE.width, BLOCK2_SIZE.height);
        this.blocks.add(block2);
        const block3 =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y + 255, 'blue');
        const BLOCK3_SIZE = {
            width: 550,
            height: 30
        }
        block3.setDisplaySize(BLOCK3_SIZE.width, BLOCK3_SIZE.height);
        this.blocks.add(block3);

        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 50, 'hand');
        this.handMoveDirection = Direction.Left;
        console.log(this.hand);
        console.log(this.arcadeArea);

        this.physics.add.collider(this.hand, this.blocks, () => {
            this.scene.start('GameOver');
        });

        this.isLoot = false;
        this.lootCount = 0;
        this.lootScoreMsg = this.add.text(
            100,
            100,
            `${this.lootCount}`,
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        if (!this.isLoot) {
            const lootPos: Pos = getLootRandomPos(this.arcadeAreaCoords);
            this.loot = this.physics.add.sprite(lootPos.x, lootPos.y, 'coins');
            this.isLoot = true;
            this.physics.add.collider(this.loot, this.blocks, () => {
                const lootPos: Pos = getLootRandomPos(this.arcadeAreaCoords);
                this.loot.setX(lootPos.x);
                this.loot.setY(lootPos.y);
            });
            this.physics.add.collider(this.loot, this.hand, () => {
                this.loot.destroy();
                this.isLoot = false;
                this.hand.body.velocity.x *= 2;
                this.hand.body.velocity.y *= 2;
                this.lootCount += 1;
                this.lootScoreMsg.setText(`${this.lootCount}`);
            });
        }

        if (this.hand.x < 400 && this.handMoveDirection == Direction.Left) {
            this.hand.x = 950;
        }
        if (this.hand.x > 880 && this.handMoveDirection == Direction.Right) {
            this.hand.x = 350;
        }

        if (this.cursors.left.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Left;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-100);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.handMoveDirection == Direction.Right || this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Right;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(100);
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
