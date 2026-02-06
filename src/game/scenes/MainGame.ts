import { Scene } from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';

// TODO?: also move to config?
interface Pos {
    x: number,
    y: number
}

interface GameObjPos {
    x: number,
    y: number,
    width: number,
    height: number
}

enum Direction {
  Up,
  Down,
  Left,
  Right,
}

const letterKeyCodes: Record<string, number> = {
    'S': 83,
    'D': 68,
    'F': 70
}

// TODO?: mb move to utilities or smth
// Source - https://stackoverflow.com/a/2450976
// Posted by ChristopheD, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-04, License - CC BY-SA 4.0
function shuffle(array: Array<string>) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}

// TODO: follow convention: if smth used only inside one method it is this method scope variable. if it used in several methods it is class property
export class MainGame extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;

    music1;
    music2;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    rightAnswerKey: Phaser.Input.Keyboard.Key | number;
    wrongAnswer1Key: Phaser.Input.Keyboard.Key | number;
    wrongAnswer2Key: Phaser.Input.Keyboard.Key | number;

    rightAnswerKey2: Phaser.Input.Keyboard.Key | number;
    wrongAnswer1Key2: Phaser.Input.Keyboard.Key | number;
    wrongAnswer2Key2: Phaser.Input.Keyboard.Key | number;

    table: Phaser.GameObjects.Image;

    bubblePlayer: Phaser.GameObjects.Image;
    bubbleEnemy: Phaser.GameObjects.Image;
    emojis: string[];
    emojisImages: Phaser.GameObjects.Group;
    qAndA: Record<string, string>;
    answerKeysLetters: Array<string>;
    isDialogueGoing: boolean;
    timeOfDialogueStart: number;
    timeDialogueEnd: number;
    wrong1: Phaser.GameObjects.Image;
    wrong2: Phaser.GameObjects.Image;
    music12Switched: boolean;
    music21Switched: boolean;

    scales: Phaser.GameObjects.Group;
    currentScale: number;
    demons: Phaser.GameObjects.Group;
    currentDemon: number;
    susProgressED: boolean;

    arcadeAreaCoords: GameObjPos;
    arcadeArea: Phaser.GameObjects.Rectangle;

    blocks: Phaser.Physics.Arcade.Group;
    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    handMoveDirection: Direction;

    lootSprites: Array<string>;
    lootAmount: number;
    collectedLootCount: number;
    loot: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    lootScoreMsg: Phaser.GameObjects.Text;

    constructor ()
    {
        super('MainGame');
    }

    // TODO: maybe add init to solve game restart after game over issues.
    // read https://docs.phaser.io/phaser/concepts/scenes for more info

    private getLootRandomPos(): Pos
    {
        const x = (Math.random() * (this.arcadeAreaCoords.width - this.arcadeAreaCoords.x + 1 - 50)) + this.arcadeAreaCoords.x + 25;
        console.log(`randomized X coord: ${x}`)

        let y = (Math.random() * (this.arcadeAreaCoords.width - this.arcadeAreaCoords.y + 1 - 60 - 50)) + this.arcadeAreaCoords.y + 30 + 25;
        console.log(`randomized Y coord: ${y}`)

        // blockSword 60x161
        const block1LeftX = SCREEN_CENTER.x - 5 - 161/2;
        const block1RightX = SCREEN_CENTER.x - 5 + 161/2;
        const block1TopY = 200 + 60/2;
        const block1BotY = 200 - 60/2;
        console.log(`BLOCK1 from ${block1LeftX} ${block1TopY} to ${block1RightX} ${block1BotY}`)
        if ((block1LeftX > x > block1RightX) && (block1TopY > y > block1BotY)) {
            const verticalOffset = ((y - this.arcadeAreaCoordsCenter.y - 100 - 30/2) + 20)
            console.log(`loot (seem to be) on block, adding offset ${verticalOffset}`)
            y += verticalOffset;
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
            this.lootAmount -= 1;
            this.collectedLootCount += 1;
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
            this.lootScoreMsg.setText(`${this.collectedLootCount}`);
        });
    }

    private answerConstructor(Pos: Pos, Letter: string, Emoji: string)
    {
        console.log(`answer constructor fired for letter ${Letter} at ${this.time.now}`)
        this.add.text(
            (Pos.x - 150),
            (Pos.y - 50),
            `${Letter}`,
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );
        const answer = this.add.image(Pos.x, Pos.y, Emoji);
        answer.setDepth(1);
        this.emojisImages.add(answer);
        console.log(`cunstructer answer ${Letter} at ${this.time.now}, udating dialogue start time`)
        this.timeOfDialogueStart = this.time.now;
    }

    private setupDialogue(QAndA: Record<string, string>, Emojis: string[])
    {
        console.log(`SETUP DIALOGUE FIRED at ${this.time.now}`)
        this.isDialogueGoing = true;
        console.log(`is dialogue going after setup dialogue start -- ${this.isDialogueGoing}`)
        this.timeOfDialogueStart = 1.7976931348623157E+308;
        const questions: Array<string> = Object.keys(QAndA);
        const question: string = questions[Math.floor(Math.random()*questions.length)];

        this.time.delayedCall(0, () => {
            this.bubbleEnemy.setAlpha(1);
        })
        this.time.delayedCall(300, () => {
            const questionImage = this.add.image((GAME_WIDTH - 200), 400, question);
            questionImage.setDepth(1);
            this.emojisImages.add(questionImage);
        })
        this.time.delayedCall(600, () => {
            this.bubblePlayer.setAlpha(1);
        })

        const answer: string = QAndA[question];
        let wrongs: Array<string> = Emojis.filter((emoji) => emoji !== question && emoji !== answer);
        const wrong1: string = wrongs[Math.floor(Math.random()*wrongs.length)];
        wrongs = wrongs.filter((emoji) => emoji !== wrong1);
        const wrong2: string = wrongs[Math.floor(Math.random()*wrongs.length)];
        // 150 is emoji dimention, 20 is отступ
        const answerPositions: Array<Pos> = [{x: 200, y: 300}, {x: 200, y: (300 + 150 + 20)}, {x: 200, y: (300 + 150*2 + 20*2)}];
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
        if (this.music12Switched) {
            console.log(`ABORT music track switch -- it already switched`)
            return;
        }
        this.music12Switched = true;
        this.music21Switched = false;
        console.log(`CURRENT playback time: ${this.music1.seek}`)
        const beat: number = this.music1.seek % 1.5;
        console.log(`(potential) BEAT: ${beat}`)
        this.time.delayedCall(Math.min(beat, (1.5 - beat)), () => {
            console.log('switch to track 2 CALLBACK')
            const playbackTime: number = this.music1.seek;
            console.log(`at ${this.time.now} we start playing TRACK 2 from ${playbackTime}`)
            this.music1.stop();
            this.music2.setSeek(playbackTime);
            this.music2.play();
        });
    }
    private musicSwitchTrack2to1()
    {
        if (this.music21Switched) {
            console.log(`ABORT music track switch -- it already switched`)
            return;
        }
        this.music21Switched = true;
        this.music12Switched = false;
        const beat = this.music2.seek % 1.5;
        this.time.delayedCall(Math.min(beat, (1.5 - beat)), () => {
            console.log('switch to track 1 CALLBACK')
            const playbackTime: number = this.music2.seek;
            this.music2.stop();
            this.music1.setSeek(playbackTime);
            this.music1.play();
        });
    }

    private progressSus()
    {
        if (this.susProgressED) {
            console.log('SUS already progressed Abort')
            return;
        }

        this.susProgressED = true;

        this.scales.children.entries[this.currentScale].setAlpha(0);
        this.currentScale += 1;

        // FAIL by SUS
        if (this.currentScale >= 4) {
            return;
        }

        this.scales.children.entries[this.currentScale].setAlpha(1);

        this.currentDemon += 1;
        console.log('SUS Progressed')
    }

    private endDialogue() {
        console.log(`end dialogue fired at ${this.time.now}`)
        this.bubblePlayer.setAlpha(0);
        this.bubbleEnemy.setAlpha(0);
        this.emojisImages.clear(false, true);
        this.rightAnswerKey = 0;
        this.wrongAnswer1Key = 0;
        this.wrongAnswer2Key = 0;
        this.isDialogueGoing = false;
        this.susProgressED = false;
        console.log(`is dialogue going after end dialogue function body -- ${this.isDialogueGoing}`)
    }

    create ()
    {
        if (!this.music1) {
            console.log(`creating music track 1`)
            this.music1 = this.sound.add('music1', { loop: true });
        }
        if (!this.music2) {
            console.log(`creating music track 2`)
            this.music2 = this.sound.add('music2', { loop: true });
        }
        this.music1.play();

        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff00ff);

        // TODO?: move this stuff into config
        const ARCADE_AREA_CENTER: Pos = {
            x: (SCREEN_CENTER.x - 5),
            y: (GAME_HEIGHT/3 + 35)
        }
        const ARCADE_AREA_SIZE = {
            width: 500,
            height: 380
        }
        const ARCADE_AREA_TOP_LEFT_CORNER: Pos = {
            x: ARCADE_AREA_CENTER.x - ARCADE_AREA_SIZE.width/2,
            y: ARCADE_AREA_CENTER.y - ARCADE_AREA_SIZE.height/2
        }

        this.arcadeAreaCoords = { x: ARCADE_AREA_TOP_LEFT_CORNER.x, y: ARCADE_AREA_TOP_LEFT_CORNER.y, width: ARCADE_AREA_SIZE.width, height: ARCADE_AREA_SIZE.height };

        this.table = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'table');

        // DIALOGUE

        // TODO: mb move some of this stuff (state) to init
        this.bubbleEnemy = this.add.image((GAME_WIDTH - 200), 400, 'bubble');
        this.bubbleEnemy.setFlipY(true);
        this.bubbleEnemy.setAlpha(0);
        this.bubblePlayer = this.add.image(200, 400, 'bubble');
        this.bubblePlayer.setFlipY(true);
        this.bubblePlayer.setFlipX(true);
        this.bubblePlayer.setAlpha(0);

        this.emojis = ['emoji1', 'emoji2', 'emoji3', 'emoji4'];
        this.qAndA = { 'emoji1': 'emoji2' };
        this.answerKeysLetters = Object.keys(letterKeyCodes);
        this.emojisImages = this.add.group();
        this.isDialogueGoing = false;
        console.log(`is dialogue going on scene create -- ${this.isDialogueGoing}`)
        this.music12Switched = false;
        this.music21Switched = true; // imean track 1 is already playing

        this.scales = this.add.group();
        const scale1 = this.add.image(1100, 50, 'scale1');
        this.scales.add(scale1);
        const scale2 = this.add.image(1100, 50, 'scale2');
        scale2.setAlpha(0);
        this.scales.add(scale2);
        const scale3 = this.add.image(1100, 50, 'scale3');
        scale3.setAlpha(0);
        this.scales.add(scale3);
        const scale4 = this.add.image(1100, 50, 'scale4');
        scale4.setAlpha(0);
        this.scales.add(scale4);
        this.currentScale = 0;

        this.demons = this.add.group();
        const demon1 = this.add.image(1100, 400, 'demon1');
        this.demons.add(demon1);
        const demon2 = this.add.image(1100, 400, 'demon2');
        demon2.setAlpha(0);
        this.demons.add(demon2);
        const demon3 = this.add.image(1100, 400, 'demon3');
        demon3.setAlpha(0);
        this.demons.add(demon3);
        this.currentDemon = 0;

        this.susPregressED = false;

        this.time.delayedCall(2000, () => {
            console.log(`firing first dialogue from CREATE at ${this.time.now}`)
            this.setupDialogue(this.qAndA, this.emojis);
            console.log(`time after setup dialogue call is ${this.timeOfDialogueStart}`)
        });

        // ARCADE

        this.arcadeArea = this.add.rectangle(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y, ARCADE_AREA_SIZE.width, ARCADE_AREA_SIZE.height, 0xcccc33, 1);
        this.arcadeArea.setAlpha(0.5);

        this.blocks = this.physics.add.group({ immovable: true });
        // 60x66
        const blockCards = this.physics.add.sprite(510, 498, 'block7');
        this.blocks.add(blockCards);
        // 160x168
        const blockPickaxe = this.physics.add.sprite(430, 550, 'block1');
        this.blocks.add(blockPickaxe);
        // 122x131
        const blockBook = this.physics.add.sprite(420, 20, 'block2');
        blockBook.setFlipY(true);
        this.blocks.add(blockBook);
        // 122x131
        const blockBook2 = this.physics.add.sprite(840, 530, 'block2');
        this.blocks.add(blockBook2);
        // 116x115
        const blockBoot = this.physics.add.sprite(530, 27, 'block3');
        this.blocks.add(blockBoot);
        // 67x67
        const blockBomb = this.physics.add.sprite(880, 50, 'block4');
        this.blocks.add(blockBomb);
        // 64x118
        const blockArrows = this.physics.add.sprite(800, 52, 'block5');
        blockArrows.angle = 90;
        blockArrows.setSize(118, 64);
        this.blocks.add(blockArrows);
        // 125x118
        const blockHand = this.physics.add.sprite(700, 26, 'block6');
        this.blocks.add(blockHand);
        // 60x161
        const blockSword = this.physics.add.sprite(ARCADE_AREA_CENTER.x, 200, 'block8');
        blockSword.angle = 90;
        blockSword.setSize(161, 60);
        this.blocks.add(blockSword);
        // 171x64
        const blockScroll = this.physics.add.sprite(650, 497, 'block9');
        this.blocks.add(blockScroll);
        // 67x67
        const blockBomb2 = this.physics.add.sprite(750, 498, 'block4');
        this.blocks.add(blockBomb2);
        // 67x67
        const blockBomb3 = this.physics.add.sprite(560, 498, 'block4');
        this.blocks.add(blockBomb3);
        // 53x110
        const blockBottle = this.physics.add.sprite(630, 57, 'block10');
        blockBottle.angle = 90;
        blockBottle.setSize(110, 53);
        this.blocks.add(blockBottle);

        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 50, 'hand');
        this.handMoveDirection = Direction.Left;
        this.hand.setVelocityX(-300);

        this.physics.add.collider(this.hand, this.blocks, () => {
            this.music1.stop();
            this.music2.stop();
            this.scene.start('GameOver');
        });

        this.lootSprites = ['loot1', 'loot2', 'loot3', 'loot4'];
        this.lootAmount = 0;
        this.collectedLootCount = 0;
        this.lootScoreMsg = this.add.text(
            100,
            100,
            `${this.lootAmount}`,
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );
        this.lootAmount +=1;
        this.spawnLoot(ARCADE_AREA_CENTER);
        console.log(`we have ${this.lootAmount} of loot in (after) CREATE`)

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        // FAIL by SUS
        if (this.currentScale >= 4) {
            this.scene.start('GameOver');
        }

        // Dialogue answer -- TIMER FAIL
        if (this.isDialogueGoing) {
            // console.log(`dialogue is going in update -- ${this.isDialogueGoing}`)
            // console.log(`logged dialogue start time ${this.timeOfDialogueStart}`)
            if (this.time.now > (this.timeOfDialogueStart + 3000)) {
                // console.log(`player did not made it in time at ${this.time.now}`)
                // TODO: put all dialogue fail related into separate method
                this.progressSus();
                this.musicSwitchTrack1to2();
                this.endDialogue();
                this.timeDialogueEnd = this.time.now;
            }
        }

        // Dialogue answer INPUT
        if ((this.rightAnswerKey && this.rightAnswerKey.isDown) || (this.rightAnswerKey2 && this.rightAnswerKey2.isDown)) {
            console.log(`end dialogue w RIGHT answer`)
            this.endDialogue();
            this.timeDialogueEnd = this.time.now;
            console.log(`after right answer, switching music from track 2 to 1`)
            this.musicSwitchTrack2to1();
            // console.log(`time of dialogue end after right answer is ${this.time.now}`)
        }
        if ((this.wrongAnswer1Key && this.wrongAnswer1Key.isDown) || (this.wrongAnswer2Key && this.wrongAnswer2Key.isDown) || (this.wrongAnswer1Key2 && this.wrongAnswer1Key2.isDown) || (this.wrongAnswer2Key2 && this.wrongAnswer2Key2.isDown)) {
            console.log(`end dialogue w WRONG answer at ${this.time.now}`)
            this.endDialogue();
            // this.scene.start('GameOver');
            // TODO: hit sus scale
            console.log(`after wrong answer, switching music to track 2 (more intense)`)
            this.musicSwitchTrack1to2();
            this.timeDialogueEnd = this.time.now;
        }

        // SPAWN dialogue with 5 sec break
        if (!this.isDialogueGoing) {
            console.log(`dialogue is not going in update, checking elapsed time -- ${this.isDialogueGoing}`)
            const treshholdTime = this.timeDialogueEnd + 5000;
            console.log(`elapsed time: ${treshholdTime - this.time.now}`)
            if (this.time.now > treshholdTime) {
                console.log(`starting dialogue from update at ${this.time.now}`)
                this.setupDialogue(this.qAndA, this.emojis);
                console.log(`is dialogue going after setup dialogue in update -- ${this.isDialogueGoing}`)
            }
        }

        // Create LOOT
        if (this.lootAmount === 0) {
            console.log(`we DONT HAVE any loot in UPDATE`)
            this.lootAmount += 1;
            this.time.delayedCall(1000, () => {
                const ARCADE_AREA_CENTER: Pos = {
                    x: (SCREEN_CENTER.x - 5),
                    y: (GAME_HEIGHT/3 + 55)
                };
                this.spawnLoot(ARCADE_AREA_CENTER);
            })
        }

        // Horizontal WRAP
        if (this.hand.x < 430 && this.handMoveDirection == Direction.Left) {
            this.hand.x = 870;
        }
        if (this.hand.x > 850 && this.handMoveDirection == Direction.Right) {
            this.hand.x = 410;
        }

        if (this.cursors.left.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Left;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-300);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Right;
                this.hand.setSize(100, 300);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(50);
            }
        }
        else if (this.cursors.up.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Up;
                this.hand.setSize(50, 100);
                this.hand.angle = 90;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(-300);
            }
        }
        else if (this.cursors.down.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Down;
                this.hand.setSize(50, 100);
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
