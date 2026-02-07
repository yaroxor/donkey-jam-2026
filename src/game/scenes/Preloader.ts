import { Scene } from 'phaser';

import { SCREEN_CENTER } from '../config.ts';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
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
        this.load.audio('crack-head', 'music/crack-head.mp3');

        this.load.image('main-menu', 'main-menu.png');
        this.load.image('start1', 'menuUI/start1.png');
        this.load.image('start-hovered', 'menuUI/start-hovered.png');
        this.load.image('options1', 'menuUI/options1.png');
        this.load.image('options-hovered', 'menuUI/options-hovered.png');
        this.load.image('info1', 'menuUI/info1.png');
        this.load.image('info-hovered', 'menuUI/info-hovered.png');

        this.load.image('gameover', 'gameover.png');

        this.load.image('table', 'table.png');

        this.load.image('scale1', 'scale/1.png');
        this.load.image('scale2', 'scale/2.png');
        this.load.image('scale3', 'scale/3.png');
        this.load.image('scale4', 'scale/4.png');

        this.load.image('skel1', 'skel/1.png');
        this.load.image('skel2', 'skel/2.png');
        this.load.image('skel3', 'skel/3.png');
        this.load.image('skel4', 'skel/4.png');

        this.load.image('demon1', 'demon/1.png');
        this.load.image('demon2', 'demon/2.png');
        this.load.image('demon3', 'demon/3.png');
        this.load.image('demon4', 'demon/4.png');

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

        this.load.image('bubble-skel', 'bubble-skel.png');
        this.load.image('bubble-demon', 'bubble-demon.png');

        this.load.image('drum', 'emojis/skel/барабан С.png')
        this.load.image('casino', 'emojis/skel/казино С.png')
        this.load.image('movie-tape', 'emojis/skel/киноплёнка С.png')
        this.load.image('cat', 'emojis/skel/кот С.png')
        this.load.image('dice', 'emojis/skel/кубик игральный С.png')
        this.load.image('money-bag', 'emojis/skel/мешок с деньгами С.png')
        this.load.image('mice', 'emojis/skel/мышь С.png')
        this.load.image('meet', 'emojis/skel/мясо С.png')
        this.load.image('tennis', 'emojis/skel/настольный теннис С.png')
        this.load.image('note', 'emojis/skel/нота С.png')
        this.load.image('jew', 'emojis/skel/ожерелье С.png')
        this.load.image('palete', 'emojis/skel/палитра С.png')
        this.load.image('cook', 'emojis/skel/повар орк С.png')
        this.load.image('ghost', 'emojis/skel/призрак С.png')
        this.load.image('ball', 'emojis/skel/футбольный мяч С.png')
        this.load.image('skull', 'emojis/skel/череп С.png')

        this.load.image('drumDemon', 'emojis/demon/барабан Д.png')
        this.load.image('casinoDemon', 'emojis/demon/казино Д.png')
        this.load.image('movie-tapeDemon', 'emojis/demon/киноплёнка Д.png')
        this.load.image('catDemon', 'emojis/demon/кот Д.png')
        this.load.image('diceDemon', 'emojis/demon/кубик игральный Д.png')
        this.load.image('money-bagDemon', 'emojis/demon/мешок с деньгами Д.png')
        this.load.image('miceDemon', 'emojis/demon/мышь Д.png')
        this.load.image('meetDemon', 'emojis/demon/мясо Д.png')
        this.load.image('tennisDemon', 'emojis/demon/настольный теннис Д.png')
        this.load.image('noteDemon', 'emojis/demon/нота Д.png')
        this.load.image('jewDemon', 'emojis/demon/ожерелье Д.png')
        this.load.image('paleteDemon', 'emojis/demon/палитра Д.png')
        this.load.image('cookDemon', 'emojis/demon/повар орк Д.png')
        this.load.image('ghostDemon', 'emojis/demon/призрак Д.png')
        this.load.image('ballDemon', 'emojis/demon/футбольный мяч Д.png')
        this.load.image('skullDemon', 'emojis/demon/череп Д.png')
    }

    create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        //  Move to the MainMenu. You could also swap this for a Scene Transition, such as a camera fade.
        this.scene.start('MainMenu');
    }
}
