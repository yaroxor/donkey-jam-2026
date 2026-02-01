import { Scene, GameObjects } from 'phaser';

import { SCREEN_CENTER, GAME_HEIGHT } from '../config.ts';

const LOWER_THIRD: number = 2*GAME_HEIGHT/3;

export class MainMenu extends Scene
{
    background: GameObjects.Image;

    startGame: GameObjects.Text;
    bang: GameObjects.Sprite;

    spaceKey: Phaser.Input.Keyboard.Key;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.background = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'main-menu');

        this.bang = this.add.sprite(SCREEN_CENTER.x, LOWER_THIRD, 'bang');
        this.bang.setAlpha(0);
        // this.bang.setOrigin(0.5);

        this.startGame = this.add.text(
            SCREEN_CENTER.x,
            LOWER_THIRD,
            'START GAME',
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );
        this.startGame.setOrigin(0.5);
        // const shape = new Phaser.Geom.Ellipse(SCREEN_CENTER.x - 800 / 2, LOWER_THIRD, 800, 360);
        // console.log(shape);
        // this.startGame.setInteractive(shape, Phaser.Geom.Ellipse.Contains);
        this.startGame.setInteractive();

        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
        this.startGame.on('pointerover', () => {
            this.bang.setAlpha(1);
        });
        this.startGame.on('pointerdown', () => {
            this.scene.start('MainGame');
        })
        this.startGame.on('pointerout', () => {
            this.bang.setAlpha(0);
        })
    }

    update()
    {
        // this.scene.start('MainGame');
        if (this.spaceKey.isDown) {
            this.scene.start('MainGame');
        }
    }
}
