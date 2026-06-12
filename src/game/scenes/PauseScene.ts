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

        // Hit-zones centered on the MEASURED label positions in paused.png
        // (threshold + trim, 2026-06-12): RESUME text spans x 550..732,
        // y 318..349 (center 641, 334); LEAVE spans x 569..713, y 416..448
        // (center 641, 432). The original zones were eyeballed ~45px below
        // the labels, leaving the visible text essentially unclickable —
        // re-measure if the asset's label area ever shifts (the e2e pause
        // test clicks the label centers and will catch drift).
        const resumeBtn = this.add.rectangle(SCREEN_CENTER.x, 334, 280, 70, 0x000000, 0);
        resumeBtn.setInteractive();
        resumeBtn.on('pointerdown', () => this.resumeGame());

        const leaveBtn = this.add.rectangle(SCREEN_CENTER.x, 432, 240, 60, 0x000000, 0);
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
