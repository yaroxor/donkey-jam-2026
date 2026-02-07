import { Scene } from 'phaser';

import { GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';

export class GameOver extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    spaceKey: Phaser.Input.Keyboard.Key;

    constructor ()
    {
        super('GameOver');
    }

    create ()
    {
        this.camera = this.cameras.main
        this.camera.setBackgroundColor(0xbb3333);

        this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'gameover');

        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
        this.input.once('pointerdown', () => {
            this.scene.start('MainMenu');
        });
    }

    update()
    {
        if (this.spaceKey.isDown) {
            this.scene.start('MainGame');
        }
    }
}
