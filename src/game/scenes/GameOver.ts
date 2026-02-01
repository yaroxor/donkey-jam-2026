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
        this.camera.setBackgroundColor(0xff0000);

        const text1 = this.add.text(
            SCREEN_CENTER.x,
            GAME_HEIGHT/3,
            'GAME OVERRR',
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );
        text1.setOrigin(0.5);
        const text2 = this.add.text(
            SCREEN_CENTER.x + 100,
            GAME_HEIGHT/3 + 150,
            '(LOH)',
            {
                fontFamily: 'Eater',
                fontSize: '64px',
                color: '#33ff33'
            }
        );
        text2.setOrigin(0.5);

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
