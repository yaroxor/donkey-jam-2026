import { Scene } from 'phaser';

import { SCREEN_CENTER, MENU_CURSOR } from '../config.ts';

// Overlay scene launched on top of (and pausing) MainGame. Camera is
// transparent — MainGame's frozen frame shows through any transparent
// areas in paused.png. The asset has two visible options ("RESUME" and
// "LEAVE"); each gets an invisible interactive rectangle on top.
export class PauseScene extends Scene
{
    constructor ()
    {
        super({ key: 'Pause', active: false });
    }

    create ()
    {
        this.input.setDefaultCursor(MENU_CURSOR);

        this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'paused');

        // Hit-zones aligned to the text positions in paused.png. Approximate;
        // adjust if the visible label area shifts in a future asset rev.
        const resumeBtn = this.add.rectangle(SCREEN_CENTER.x, 380, 280, 70, 0x000000, 0);
        resumeBtn.setInteractive();
        resumeBtn.on('pointerdown', () => this.resumeGame());

        const leaveBtn = this.add.rectangle(SCREEN_CENTER.x, 470, 240, 60, 0x000000, 0);
        leaveBtn.setInteractive();
        leaveBtn.on('pointerdown', () => this.leaveToMenu());

        if (this.input.keyboard) {
            this.input.keyboard.once('keydown-ESC', () => this.resumeGame());
        }
    }

    private resumeGame()
    {
        this.scene.resume('MainGame');
        this.scene.stop();
    }

    private leaveToMenu()
    {
        // MainGame is paused beneath us; explicitly stop it so it doesn't
        // linger in memory. Its SHUTDOWN-event cleanup (subscribed in
        // MainGame.create) stops the music here — this path bypasses
        // endLevel, which is the only other music-stopping exit.
        this.scene.stop('MainGame');
        this.scene.start('MainMenu');
    }
}
