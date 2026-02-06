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

        this.load.audio('music1', 'music/Slick Hand Joe 1.mp3');
        this.load.audio('music2', 'music/Slick Hand Joe 2.mp3');
        // this.load.audio('crack-head', 'crack-head.waw');

        this.load.image('main-menu', 'main-menu.png');
        this.load.image('start1', 'menuUI/start1.png');
        this.load.image('start-hovered', 'menuUI/start-hovered.png');
        this.load.image('options1', 'menuUI/options1.png');
        this.load.image('options-hovered', 'menuUI/options-hovered.png');
        this.load.image('info1', 'menuUI/info1.png');
        this.load.image('info-hovered', 'menuUI/info-hovered.png');

        this.load.image('table', 'table.png');
        this.load.image('hand', 'hand.png');

        this.load.image('block1', 'blocks/1.png');
        this.load.image('block2', 'blocks/2.png');
        this.load.image('block3', 'blocks/3.png');
        this.load.image('block4', 'blocks/4.png');
        this.load.image('block5', 'blocks/5.png');
        this.load.image('block6', 'blocks/6.png');
        this.load.image('block7', 'blocks/7.png');
        this.load.image('block8', 'blocks/8.png');
        this.load.image('block9', 'blocks/9.png');
        this.load.image('block10', 'blocks/10.png');

        this.load.image('loot1', 'loot/1.png');
        this.load.image('loot2', 'loot/2.png');
        this.load.image('loot3', 'loot/3.png');
        this.load.image('loot4', 'loot/4.png');

        this.load.image('bubble', 'bubble.png');
        this.load.image('emoji1', 'emojis/emoji1.png');
        this.load.image('emoji2', 'emojis/emoji2.jpg');
        this.load.image('emoji3', 'emojis/emoji3.png');
        this.load.image('emoji4', 'emojis/emoji4.png');
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('MainMenu');
    }
}
