import { Scene } from 'phaser';

import { SCREEN_CENTER, MENU_CURSOR } from '../config.ts';

// Overlay scene launched on top of (and pausing) MainGame when the player
// hits the loot target. Like GameOver, the camera is transparent -- the
// frozen MainGame frame shows through, so the player sees their winning
// state preserved behind the win text. Click anywhere or press Space to
// restart.
//
// Placeholder text until proper win art lands. When the artist delivers
// a win sprite, swap the Text for an Image (mirror of GameOver's
// `this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'gameover')`) and add
// the corresponding `this.load.image('win', '...')` in Preloader.ts.
//
// Future scope (not in this commit): scoreboard, time-to-completion,
// loot-rarity summary, transition-to-next-level button. The reason Win is
// a separate scene from GameOver -- even though they share the same restart
// flow today -- is that these future enrichments are win-specific and
// shouldn't crowd into the loss path.
export class Win extends Scene
{
    spaceKey: Phaser.Input.Keyboard.Key;

    constructor ()
    {
        super({ key: 'Win', active: false });
    }

    create ()
    {
        this.input.setDefaultCursor(MENU_CURSOR);

        this.add.text(
            SCREEN_CENTER.x,
            SCREEN_CENTER.y,
            'YOU WIN!',
            {
                fontFamily: 'Architects Daughter',
                fontSize: '96px',
                color: '#44323f',
            },
        ).setOrigin(0.5);

        this.input.once('pointerdown', () => this.restart());
        if (this.input.keyboard) {
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }
    }

    update()
    {
        if (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            this.restart();
        }
    }

    private restart()
    {
        // scene.start auto-shuts-down the calling scene (this) and restarts
        // MainGame fresh. Future versions may route to MainMenu, a
        // level-select, or a transition-to-next-level scene instead.
        this.scene.start('MainGame');
    }
}
