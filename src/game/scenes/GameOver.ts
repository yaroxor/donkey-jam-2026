import { Scene } from 'phaser';

import { SCREEN_CENTER, MENU_CURSOR } from '../config.ts';

// Overlay scene launched on top of (and pausing) MainGame. Camera is
// transparent — the frozen MainGame frame shows through any transparent
// areas of gameover.png. Click anywhere or press Space to restart.
export class GameOver extends Scene
{
    spaceKey: Phaser.Input.Keyboard.Key;

    constructor ()
    {
        super({ key: 'GameOver', active: false });
    }

    create ()
    {
        this.input.setDefaultCursor(MENU_CURSOR);

        this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'gameover');

        this.input.once('pointerdown', () => this.restart());
        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
    }

    update()
    {
        if (this.spaceKey?.isDown) {
            this.restart();
        }
    }

    private restart()
    {
        // scene.start auto-shuts-down the calling scene (this) and restarts
        // MainGame fresh — even though MainGame is currently in paused state,
        // Phaser shutdowns then re-creates it.
        this.scene.start('MainGame');
    }
}
