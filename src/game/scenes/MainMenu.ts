import { Scene, GameObjects } from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';

export class MainMenu extends Scene
{
    poster: GameObjects.Image;

    startButton: GameObjects.Image;
    startButtonHovered: GameObjects.Image;
    infoButton: GameObjects.Image;
    infoButtonHovered: GameObjects.Image;
    optionsButton: GameObjects.Image;
    optionsButtonHovered: GameObjects.Image;
    infoScreen: GameObjects.Image;

    spaceKey: Phaser.Input.Keyboard.Key;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.poster = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'main-menu');

        this.infoScreen = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'info-screen');
        this.infoScreen.setAlpha(0);

        // 300x91
        this.startButton = this.add.image((GAME_WIDTH - 300 - 72), (GAME_HEIGHT - 91 - 70), 'start1');
        this.startButton.setOrigin(0);
        this.startButton.setInteractive();
        this.startButtonHovered = this.add.image((GAME_WIDTH - 300 - 72), (GAME_HEIGHT - 91 - 70), 'start-hovered')
        this.startButtonHovered.setOrigin(0);
        this.startButtonHovered.setAlpha(0);
        this.startButton.on('pointerover', () => {
            this.startButtonHovered.setAlpha(1);
        });
        this.startButton.on('pointerdown', () => {
            this.scene.start('MainGame');
        })
        this.startButton.on('pointerout', () => {
            this.startButtonHovered.setAlpha(0);
        })

        // 152x67
        this.infoButton = this.add.image((GAME_WIDTH - 300 - 70), (GAME_HEIGHT - 67 - 10), 'info1');
        this.infoButton.setOrigin(0);
        this.infoButton.setInteractive();
        this.infoButtonHovered = this.add.image((GAME_WIDTH - 300 - 70), (GAME_HEIGHT - 67 - 10), 'info-hovered');
        this.infoButtonHovered.setOrigin(0);
        this.infoButtonHovered.setAlpha(0);
        this.infoButton.on('pointerover', () => {
            this.infoButtonHovered.setAlpha(1);
        });
        this.infoButton.on('pointerdown', () => {
            this.infoScreen.setAlpha(1);
        })
        this.infoButton.on('pointerout', () => {
            this.infoButtonHovered.setAlpha(0);
        })

        // 152x67
        this.optionsButton = this.add.image((GAME_WIDTH - 152 - 70), (GAME_HEIGHT - 67 - 10), 'options1');
        this.optionsButton.setOrigin(0);
        this.optionsButton.setInteractive();
        this.optionsButtonHovered = this.add.image((GAME_WIDTH - 152 - 70), (GAME_HEIGHT - 67 - 10), 'options-hovered')
        this.optionsButtonHovered.setOrigin(0);
        this.optionsButtonHovered.setAlpha(0);
        this.optionsButton.on('pointerover', () => {
            this.optionsButtonHovered.setAlpha(1);
        });
        this.optionsButton.on('pointerdown', () => {
            this.scene.start('MainGame');
        })
        this.optionsButton.on('pointerout', () => {
            this.optionsButtonHovered.setAlpha(0);
        })

        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
    }

    update()
    {
        if (this.spaceKey.isDown) {
            this.scene.start('MainGame');
        }
    }
}
