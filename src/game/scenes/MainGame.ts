import { Scene } from 'phaser';

import { Pos, GameObjLayout, Direction } from '../config.ts';
import { GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER, ARCADE_AREA_CENTER, ARCADE_AREA_LAYOUT, LOOT_SIZE, GameState } from '../config.ts';
import { shuffle } from '../utils.ts';

// TODO 2: config or utils?
const letterKeyCodes: Record<string, number> = {
    'S': 83,
    'D': 68,
    'F': 70
}

// TODO 2: Check to follow convention: if smth used only inside one method it is this method scope variable. if it used in several methods it is class property
export class MainGame extends Scene
{
    private camera: Phaser.Cameras.Scene2D.Camera;

    private music1: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
    private music2: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

    private gameState: GameState;

    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private rightAnswerKey: Phaser.Input.Keyboard.Key;
    private wrongAnswer1Key: Phaser.Input.Keyboard.Key;
    private wrongAnswer2Key: Phaser.Input.Keyboard.Key;

    private rightAnswerKey2: Phaser.Input.Keyboard.Key;
    private wrongAnswer1Key2: Phaser.Input.Keyboard.Key;
    private wrongAnswer2Key2: Phaser.Input.Keyboard.Key;

    private bubblePlayer: Phaser.GameObjects.Image;
    private bubbleEnemy: Phaser.GameObjects.Image;
    private emojis: string[];
    private emojisImages: Phaser.GameObjects.Group;
    private qAndA: Record<string, string>;
    private answerKeysLetters: Array<string>;

    private arcadeAreaLayout: GameObjLayout;

    private blocks: Phaser.Physics.Arcade.Group;
    private hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

    private lootSprites: Array<string>;
    private loot: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private lootScoreMsg: Phaser.GameObjects.Text;

    constructor ()
    {
        super('MainGame');
    }

    private getLootRandomPos(): Pos
    {
        const x: number = (Math.random() * this.arcadeAreaLayout.width) + this.arcadeAreaLayout.x;
        console.log(`randomized X coord: ${x}`)

        let y: number = (Math.random() * this.arcadeAreaLayout.height) + this.arcadeAreaLayout.y;
        console.log(`randomized Y coord: ${y}`)

        // blockSword 60x161
        // TODO 2: rid of magic numbers
        const blockLeftX:  number = SCREEN_CENTER.x - 5 - 161/2 - LOOT_SIZE.width/2;
        const blockRightX: number = SCREEN_CENTER.x - 5 + 161/2 + LOOT_SIZE.width/2;
        const blockTopY:   number = 200 - 60/2 - LOOT_SIZE.height/2;
        const blockBotY:   number = 200 + 60/2 + LOOT_SIZE.height/2;
        console.log(`-|--|--|-  BLOCK from ${blockLeftX} ${blockTopY} to ${blockRightX} ${blockBotY}`)
        if (((x > blockLeftX) && (x < blockRightX)) && ((y > blockTopY) && (y < blockBotY))) {
            console.log(`-|--|--|-  !!!  loot (seem to be) on block`)
            console.log(`y: ${y}, block top y: ${blockTopY}, block bot y: ${blockBotY}`)
            const verticalOffset = ((y - blockTopY) + 40)
            console.log(`substracting offset ${verticalOffset}`)
            y -= verticalOffset;
        }

        const lootPos = { x: x, y: y};
        return lootPos;
    }

    private spawnLoot() {
        const lootPos: Pos = this.getLootRandomPos();
        console.log(`SPAWNING loot at `)
        console.log(lootPos)
        const lootPic = this.lootSprites[Math.floor(Math.random()*4)];
        this.loot = this.physics.add.sprite(lootPos.x, lootPos.y, lootPic);
        this.physics.add.collider(this.loot, this.hand, () => {
            this.loot.destroy();
            this.gameState.lootAmount -= 1;
            this.gameState.collectedLootCount += 1;
            if (this.hand.body.velocity.x !== 0) {
                if (this.hand.body.velocity.x > 0) {
                    this.hand.body.setVelocityX(300);
                }
                else {
                    this.hand.body.setVelocityX(-300);
                }

            }
            if (this.hand.body.velocity.y !== 0) {
                if (this.hand.body.velocity.y > 0) {
                    this.hand.body.setVelocityY(300);
                }
                else {
                    this.hand.body.setVelocityY(-300);
                }

            }
            this.lootScoreMsg.setText(`${this.gameState.collectedLootCount}`);
        });
    }

    private answerConstructor(Pos: Pos, Letter: string, Emoji: string)
    {
        console.log(`answer constructor fired for letter ${Letter} at ${this.time.now}`)
        const answer = this.add.image(Pos.x, Pos.y, Emoji);
        answer.setDepth(1);
        this.emojisImages.add(answer);
        console.log(`cunstructer answer ${Letter} at ${this.time.now}, udating dialogue start time`)
        this.gameState.timeOfDialogueStart = this.time.now;
    }

    private setupDialogue(QAndA: Record<string, string>, Emojis: string[])
    {
        console.log(`SETUP DIALOGUE FIRED at ${this.time.now}`)
        this.gameState.isDialogueGoing = true;
        this.gameState.susProgressED = false;
        console.log(`~~~ In setupDialogue, setting susProgressED to ${this.gameState.susProgressED}`)
        console.log(`is dialogue going after setup dialogue start -- ${this.gameState.isDialogueGoing}`)
        this.gameState.timeOfDialogueStart = 1.7976931348623157E+308;
        const questions: Array<string> = Object.keys(QAndA);
        const question: string = questions[Math.floor(Math.random()*questions.length)];

        this.time.delayedCall(0, () => {
            this.bubbleEnemy.setAlpha(1);
        })
        this.time.delayedCall(300, () => {
            const questionImage = this.add.image((GAME_WIDTH - 200), 430, question);
            questionImage.setDepth(1);
            this.emojisImages.add(questionImage);
        })
        this.time.delayedCall(600, () => {
            this.bubblePlayer.setAlpha(1);
        })

        const question2 = question.replace(/Demon$/, '');
        const answer: string = QAndA[question];
        let wrongs: Array<string> = Emojis.filter((emoji) => emoji !== question2 && emoji !== answer);
        const wrong1: string = wrongs[Math.floor(Math.random()*wrongs.length)];
        wrongs = wrongs.filter((emoji) => emoji !== wrong1);
        const wrong2: string = wrongs[Math.floor(Math.random()*wrongs.length)];
        const answerPositions: Array<Pos> = [{x: 150, y: 395}, {x: 280, y: 380}, {x: 220, y: 460}];
        const answers: Array<string> = [answer, wrong1, wrong2];
        shuffle(answers);
        const rightNumber: number = answers.indexOf(answer);
        let rightLetter: string = '';

        let delay = 700
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(delay, () => {
                this.answerConstructor(answerPositions[i], this.answerKeysLetters[i], answers[i]);
            });
            if (i == rightNumber) {
                rightLetter = this.answerKeysLetters[i];
            }
            delay += 100;
        };
        console.log(`time after answers construction loop is ${this.time.now}`)

        const hackLetterCodes: Record<string, number> = {
            'S': 79, // O
            'D': 69, // E
            'F': 85 // U
        }
        for (const letter in letterKeyCodes) {
            const keyCode: number = letterKeyCodes[letter];
            const hackKeyCode: number = hackLetterCodes[letter];
            if (this.input.keyboard) {
                if (letter === rightLetter) {
                    console.log(`right answer is ${letter}`);
                    this.rightAnswerKey = this.input.keyboard.addKey(keyCode);
                    this.rightAnswerKey2 = this.input.keyboard.addKey(hackKeyCode);
                }
                else if (!this.wrongAnswer1Key) {
                    this.wrongAnswer1Key = this.input.keyboard.addKey(keyCode);
                    this.wrongAnswer1Key2 = this.input.keyboard.addKey(hackKeyCode);
                }
                else {
                    this.wrongAnswer2Key = this.input.keyboard.addKey(keyCode);
                    this.wrongAnswer2Key2 = this.input.keyboard.addKey(hackKeyCode);
                }

            }
        }
    }

    private musicSwitchTrack1to2()
    {
        if (this.gameState.music12Switched) {
            this.sound.play('crack-head');
            console.log(`ABORT music track switch -- it already switched`)
            return;
        }
        this.gameState.music12Switched = true;
        this.gameState.music21Switched = false;
        console.log(`CURRENT playback time: ${this.music1.seek}`)
        const beat: number = this.music1.seek % 1.5;
        console.log(`(potential) BEAT: ${beat}`)
        this.time.delayedCall(Math.min(beat, (1.5 - beat)), () => {
            console.log('switch to track 2 CALLBACK')
            const playbackTime: number = this.music1.seek;
            console.log(`at ${this.time.now} we start playing TRACK 2 from ${playbackTime}`)
            this.music1.stop();
            this.music2.setSeek(playbackTime);
            this.sound.play('crack-head');
            this.music2.play();
        });
    }
    private musicSwitchTrack2to1()
    {
        if (this.gameState.music21Switched) {
            console.log(`ABORT music track switch -- it already switched`)
            return;
        }
        this.gameState.music21Switched = true;
        this.gameState.music12Switched = false;
        const beat = this.music2.seek % 1.5;
        this.time.delayedCall(Math.min(beat, (1.5 - beat)), () => {
            console.log('switch to track 1 CALLBACK')
            const playbackTime: number = this.music2.seek;
            this.music2.stop();
            this.music1.setSeek(playbackTime);
            this.music1.play();
        });
    }

    private endDialogue() {
        console.log(`end dialogue fired at ${this.time.now}`)
        this.bubblePlayer.setAlpha(0);
        this.bubbleEnemy.setAlpha(0);
        this.emojisImages.clear(false, true);
        // TODO: state management
        this.gameState.isDialogueGoing = false;
        console.log(`is dialogue going after end dialogue function body -- ${this.gameState.isDialogueGoing}`)
    }

    private answerFail() {
        this.gameState.progressSus();
        this.musicSwitchTrack1to2();
        this.endDialogue();
        this.gameState.timeOfDialogueEnd = this.time.now;
        // TODO: state management
    }

    init() {
        // read https://docs.phaser.io/phaser/concepts/scenes for more info

        const scales = this.add.group();
        const demons = this.add.group();
        const skels  = this.add.group();

        const scale1 = this.add.image(1100, 50, 'scale1');
        scales.add(scale1);
        const scale2 = this.add.image(1100, 50, 'scale2');
        scale2.setAlpha(0);
        scales.add(scale2);
        const scale3 = this.add.image(1100, 50, 'scale3');
        scale3.setAlpha(0);
        scales.add(scale3);
        const scale4 = this.add.image(1100, 50, 'scale4');
        scale4.setAlpha(0);
        scales.add(scale4);

        const demon1 = this.add.image(1100, 410, 'demon1');
        demons.add(demon1);
        const demon2 = this.add.image(1100, 410, 'demon2');
        demon2.setAlpha(0);
        demons.add(demon2);
        const demon3 = this.add.image(1100, 410, 'demon3');
        demon3.setAlpha(0);
        demons.add(demon3);
        const demon4 = this.add.image(1100, 410, 'demon4');
        demon4.setAlpha(0);
        demons.add(demon4);

        const skel1 = this.add.image(200, 400, 'skel1');
        skels.add(skel1);
        const skel2 = this.add.image(200, 400, 'skel2');
        skel2.setAlpha(0);
        skels.add(skel2);
        const skel3 = this.add.image(200, 400, 'skel3');
        skel3.setAlpha(0);
        skels.add(skel3);
        const skel4 = this.add.image(200, 400, 'skel4');
        skel4.setAlpha(0);
        skels.add(skel4);

        this.gameState = new GameState(scales, demons, skels);
    }

    create ()
    {
        if (!this.music1) {
            console.log(`creating music track 1`)
            this.music1 = this.sound.add('music1', { loop: true }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
        }
        if (!this.music2) {
            console.log(`creating music track 2`)
            this.music2 = this.sound.add('music2', { loop: true }) as Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
        }
        this.music1.play();
        this.gameState.music21Switched = true; // imean track 1 is already playing

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff00ff);


        this.arcadeAreaLayout = { x: ARCADE_AREA_LAYOUT.x, y: ARCADE_AREA_LAYOUT.y, width: ARCADE_AREA_LAYOUT.width, height: ARCADE_AREA_LAYOUT.height };

        this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'table');

        // DIALOGUE

        // TODO: mb move some of this stuff (state) to init

        this.bubbleEnemy = this.add.image((GAME_WIDTH - 200), 400, 'bubble-demon');
        this.bubbleEnemy.setAlpha(0);
        this.bubbleEnemy.setDepth(1);
        this.bubblePlayer = this.add.image(200, 400, 'bubble-skel');
        this.bubblePlayer.setAlpha(0);
        this.bubblePlayer.setDepth(1);

        this.emojis = ['drum', 'casino', 'movie-tape', 'cat', 'dice', 'money-bag', 'mice', 'meet', 'tennis', 'note', 'jew', 'palete', 'cook', 'ghost', 'ball', 'skull'];
        this.qAndA = {
            'casinoDemon': 'dice',
            'catDemon': 'mice',
            'money-bagDemon': 'jew',
            'noteDemon': 'drum',
            'paleteDemon': 'movie-tape',
            'cookDemon': 'meet',
            'ghostDemon': 'skull',
            'ballDemon': 'tennis',
        };
        this.answerKeysLetters = Object.keys(letterKeyCodes);
        this.emojisImages = this.add.group();
        console.log(`is dialogue going on scene create -- ${this.gameState.isDialogueGoing}`)


        console.log(`~~~ in CreatE, setting susProgressED to ${this.gameState.susProgressED}`)

        this.time.delayedCall(2000, () => {
            console.log(`firing first dialogue from CREATE at ${this.time.now}`)
            this.setupDialogue(this.qAndA, this.emojis);
            console.log(`time after setup dialogue call is ${this.gameState.timeOfDialogueStart}`)
        });

        // ARCADE

        this.blocks = this.physics.add.group({ immovable: true });
        const block1 = this.add.rectangle(SCREEN_CENTER.x, 1, 600, 100, 0xff0000, 0);
        this.blocks.add(block1);
        const block2 = this.add.rectangle(SCREEN_CENTER.x, (GAME_HEIGHT - 120), 600, 100, 0xff0000, 0);
        this.blocks.add(block2);

        // 60x161
        const blockSword = this.physics.add.sprite(ARCADE_AREA_CENTER.x, 200, 'block8');
        blockSword.angle = 90;
        blockSword.setSize(161, 60);
        this.blocks.add(blockSword);

        // 106x67
        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 50, 'hand');
        // TODO: put back after state fix
        // this.hand.setVelocityX(-300);

        this.physics.add.collider(this.hand, this.blocks, () => {
            this.endDialogue();
            this.music1.stop();
            this.music2.stop();
            this.scene.start('GameOver');
        });

        this.lootSprites = ['loot1', 'loot2', 'loot3', 'loot4'];
        this.lootScoreMsg = this.add.text(
            50,
            5,
            `${this.gameState.collectedLootCount}`,
            {
                fontFamily: 'Architects Daughter',
                fontSize: '96px',
                color: '#44323f'
            }
        );
        this.gameState.lootAmount +=1;
        this.spawnLoot();
        console.log(`we have ${this.gameState.lootAmount} of loot in (after) CREATE`)

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        // FAIL by SUS
        if (this.gameState.currentSus >= 4) {
            this.endDialogue();
            this.music1.stop();
            this.music2.stop();
            this.scene.start('GameOver');
        }

        // Dialogue answer -- TIMER FAIL
        if (this.gameState.isDialogueGoing) {
            // console.log(`dialogue is going in update -- ${this.isDialogueGoing}`)
            // console.log(`logged dialogue start time ${this.timeOfDialogueStart}`)
            if (this.time.now > (this.gameState.timeOfDialogueStart + 3000)) {
                // console.log(`player did not made it in time at ${this.time.now}`)
                this.answerFail();
            }
        }

        // Dialogue answer INPUT
        // RIGHT
        // TODO: isDialogueGoing check not working
        if ((this.gameState.isDialogueGoing && this.rightAnswerKey.isDown) || (this.gameState.isDialogueGoing && this.rightAnswerKey2.isDown)) {
            console.log(`end dialogue w RIGHT answer`)
            this.endDialogue();
            this.gameState.timeOfDialogueEnd = this.time.now;
            console.log(`after right answer, switching music from track 2 to 1`)
            this.musicSwitchTrack2to1();
            // console.log(`time of dialogue end after right answer is ${this.time.now}`)
        }
        // WRONG
        // TODO: isDialogueGoing check not working
        if ((this.gameState.isDialogueGoing && this.wrongAnswer1Key.isDown) || (this.gameState.isDialogueGoing && this.wrongAnswer2Key.isDown) || (this.wrongAnswer1Key2 && this.wrongAnswer1Key2.isDown) || (this.wrongAnswer2Key2 && this.wrongAnswer2Key2.isDown)) {
            console.log(`end dialogue w WRONG answer at ${this.time.now}`)
            this.answerFail();
        }

        // SPAWN dialogue with 5 sec break
        if (!this.gameState.isDialogueGoing) { // TODO?: do you want to check if not only no dialog going but there was dialogue already here?
            // console.log(`dialogue is not going in update, checking elapsed time -- ${this.gameState.isDialogueGoing}`)
            const treshholdTime = this.gameState.timeOfDialogueEnd + 5000;
            // console.log(`elapsed time: ${treshholdTime - this.time.now}`)
            if (this.time.now > treshholdTime) {
                console.log(`starting dialogue from update at ${this.time.now}`)
                this.setupDialogue(this.qAndA, this.emojis);
                console.log(`is dialogue going after setup dialogue in update -- ${this.gameState.isDialogueGoing}`)
            }
        }

        // Create LOOT
        if (this.gameState.lootAmount < 0) {
            console.log(`we DONT HAVE any loot in UPDATE`)
            this.gameState.lootAmount += 1;
            this.time.delayedCall(1000, () => {
                this.spawnLoot();
            })
        }

        // Horizontal WRAP
        if (this.hand.x < 430 && this.gameState.handMoveDirection == Direction.Left) {
            this.hand.x = 870;
        }
        if (this.hand.x > 850 && this.gameState.handMoveDirection == Direction.Right) {
            this.hand.x = 410;
        }

        if (this.cursors.left.isDown) {
            if (this.gameState.handMoveDirection == Direction.Up || this.gameState.handMoveDirection == Direction.Down) {
                this.gameState.handMoveDirection = Direction.Left;
                this.hand.setSize(106, 67);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-300);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.gameState.handMoveDirection == Direction.Up || this.gameState.handMoveDirection == Direction.Down) {
                this.gameState.handMoveDirection = Direction.Right;
                this.hand.setSize(106, 67);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(300);
            }
        }
        else if (this.cursors.up.isDown) {
            if (this.gameState.handMoveDirection == Direction.Left || this.gameState.handMoveDirection == Direction.Right) {
                this.gameState.handMoveDirection = Direction.Up;
                this.hand.setSize(67, 106);
                this.hand.angle = 90;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(-300);
            }
        }
        else if (this.cursors.down.isDown) {
            if (this.gameState.handMoveDirection == Direction.Left || this.gameState.handMoveDirection == Direction.Right) {
                this.gameState.handMoveDirection = Direction.Down;
                this.hand.setSize(67, 106);
                this.hand.angle = 270;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(300);
            }
        }
    }

    shutdown()
    {
        // TODO: cleanup
        // music, timers
        // smth else?
    }
}
