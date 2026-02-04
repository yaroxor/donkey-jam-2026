import { Scene } from 'phaser';

// import { SCREEN_CENTER } from '../config.ts';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        // this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'background');

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(512-230, 384, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.audio('music', 'Slick Hand Joe.mp3');

        this.load.image('main-menu', 'main-menu.png');
        this.load.image('start1', 'start1.png');
        this.load.image('start-hovered', 'start-hovered.png');
        this.load.image('options1', 'options1.png');
        this.load.image('options-hovered', 'options-hovered.png');
        this.load.image('info1', 'info1.png');
        this.load.image('info-hovered', 'info-hovered.png');

        this.load.image('blue', 'blue.jpg');
        this.load.image('level-layout', 'level-layout.jpg');
        this.load.image('hand', 'hand.png');
        this.load.image('coins', 'coins.png');
        this.load.image('bubble', 'bubble.png');
        this.load.image('emoji1', 'emoji1.png');
        this.load.image('emoji2', 'emoji2.jpg');
        this.load.image('emoji3', 'emoji3.png');
        this.load.image('emoji4', 'emoji4.png');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.
        this.sound.play('music', { loop: true });

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('MainMenu');
    }
}
