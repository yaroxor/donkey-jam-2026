import { Scene } from 'phaser';

import { GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';

export class MainGame extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;

    layout: Phaser.GameObjects.Image;
    arcadeArea: Phaser.GameObjects.Rectangle;

    blocks: Phaser.Physics.Arcade.Group;
    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

    constructor ()
    {
        super('MainGame');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff00ff);

        const ARCADE_AREA_CENTER = {
            x: (SCREEN_CENTER.x - 5),
            y: (GAME_HEIGHT/3 + 55)
        }
        const ARCADE_AREA_SIZE = {
            width: 550,
            length: 550
        }
        const ARCADE_AREA_TOP_LEFT_CORNER = {
            x: ARCADE_AREA_CENTER.x - ARCADE_AREA_SIZE.width/2,
            y: ARCADE_AREA_CENTER.y - ARCADE_AREA_SIZE.length/2
        }

        this.physics.world.setBounds(ARCADE_AREA_TOP_LEFT_CORNER.x, ARCADE_AREA_TOP_LEFT_CORNER.y, ARCADE_AREA_SIZE.width, ARCADE_AREA_SIZE.length);

        this.layout = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'level-layout');

        this.arcadeArea = this.add.rectangle(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y, ARCADE_AREA_SIZE.width, ARCADE_AREA_SIZE.length, 0xcccc33, 1);
        this.arcadeArea.setAlpha(0.5);

        // this.blocks = this.physics.add.group({ immovable: true });
        // const BLOCK_1_POS = {x: 500, y: 500}
        // this.blocks.create(BLOCK_1_POS.x, BLOCK_1_POS.y, 'blue');
        const block =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y - 100, 'blue');
        const BLOCK_SIZE = {
            width: 200,
            height: 50
        }
        block.setDisplaySize(BLOCK_SIZE.width, BLOCK_SIZE.height);
        block.setImmovable(true);

        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 100, 'hand');
        this.hand.setCollideWorldBounds(true);

        this.physics.add.collider(block, this.hand, () => {
            this.scene.start('GameOver');
        });

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        if (this.cursors.left.isDown) {
            this.hand.setSize(100, 50);
            this.hand.angle = 0;
            this.hand.setFlipX(false);
            this.hand.setVelocityX(-300);
            // this.hand.play('hand_walk', true);
        }
        else if (this.cursors.right.isDown) {
            this.hand.setSize(100, 50);
            this.hand.angle = 0;
            this.hand.setFlipX(true);
            this.hand.setVelocityX(300);
            // this.hand.play('hand_walk', true);
        }
        else if (this.cursors.up.isDown) {
            this.hand.setSize(50, 100);
            this.hand.angle = 90;
            this.hand.setVelocityY(-300);
            // this.hand.play('hand_walk', true);
        }
        else if (this.cursors.down.isDown) {
            this.hand.setSize(50, 100);
            this.hand.angle = 270;
            this.hand.setVelocityY(300);
            // this.hand.play('hand_walk', true);
        }
        else {
            // this.hand.stop();
            // this.hand.setTexture('hand_walk1');
            this.hand.setVelocity(0);
        }
    }

    shutdown()
    {
        // TODO: cleanup
    }
}
