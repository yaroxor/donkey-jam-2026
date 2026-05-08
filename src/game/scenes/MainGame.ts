import { Scene } from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';
import { StateMachine, State } from '../StateMachine.ts';

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

type GameSound = Phaser.Sound.HTML5AudioSound | Phaser.Sound.WebAudioSound;

// TODO?: mb move to utilities or smth
// Source - https://stackoverflow.com/a/2450976
// Posted by ChristopheD, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-04, License - CC BY-SA 4.0
function shuffle(array: Array<string>) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}

type DialogueStateName = 'idle' | 'asking' | 'cooldown';
type DialogueArgs = [MainGame];

// JustDown fires once per physical press; isDown stays true every frame
// the key is held. Wrap to skip the undefined check at every call site.
function justDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
    return key !== undefined && Phaser.Input.Keyboard.JustDown(key);
}

class IdleState extends State<DialogueStateName, DialogueArgs> {
    enter(scene: MainGame): void {
        scene.time.delayedCall(2000, () => {
            this.stateMachine.transition('asking');
        });
    }
}

class AskingState extends State<DialogueStateName, DialogueArgs> {
    private timeoutTimer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        scene.showAskingUI();
        // Match prior behavior: timer started after the last answer image
        // rendered (~900ms), so total asking window was ~3.9s.
        this.timeoutTimer = scene.time.delayedCall(3900, () => this.fail(scene));
    }

    execute(scene: MainGame): void {
        if (justDown(scene.rightAnswerKey) || justDown(scene.rightAnswerKey2)) {
            scene.musicSwitchTrack2to1();
            this.stateMachine.transition('cooldown');
        } else if (
            justDown(scene.wrongAnswer1Key) || justDown(scene.wrongAnswer1Key2) ||
            justDown(scene.wrongAnswer2Key) || justDown(scene.wrongAnswer2Key2)
        ) {
            this.fail(scene);
        }
    }

    exit(scene: MainGame): void {
        this.timeoutTimer?.remove();
        scene.hideAskingUI();
    }

    private fail(scene: MainGame): void {
        if (scene.progressSus()) {
            return;
        }
        scene.musicSwitchTrack1to2();
        this.stateMachine.transition('cooldown');
    }
}

class CooldownState extends State<DialogueStateName, DialogueArgs> {
    enter(scene: MainGame): void {
        scene.time.delayedCall(5000, () => {
            this.stateMachine.transition('asking');
        });
    }
}

// TODO: follow convention: if smth used only inside one method it is this method scope variable. if it used in several methods it is class property
export class MainGame extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;

    music1: GameSound;
    music2: GameSound;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    rightAnswerKey?: Phaser.Input.Keyboard.Key;
    wrongAnswer1Key?: Phaser.Input.Keyboard.Key;
    wrongAnswer2Key?: Phaser.Input.Keyboard.Key;

    rightAnswerKey2?: Phaser.Input.Keyboard.Key;
    wrongAnswer1Key2?: Phaser.Input.Keyboard.Key;
    wrongAnswer2Key2?: Phaser.Input.Keyboard.Key;

    table: Phaser.GameObjects.Image;

    bubblePlayer: Phaser.GameObjects.Image;
    bubbleEnemy: Phaser.GameObjects.Image;
    emojis: string[];
    emojisImages: Phaser.GameObjects.Group;
    qAndA: Record<string, string>;
    answerKeysLetters: Array<string>;
    currentMusicTrack: 1 | 2;

    dialogueFSM: StateMachine<DialogueStateName, DialogueArgs>;

    scales: Phaser.GameObjects.Image[];
    demons: Phaser.GameObjects.Image[];
    skels: Phaser.GameObjects.Image[];
    currentSus: number;

    arcadeAreaCoords: GameObjPos;

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

    private getLootRandomPos(): Pos
    {
        const x: number = (Math.random() * (this.arcadeAreaCoords.width - this.arcadeAreaCoords.x + 1 - 50)) + this.arcadeAreaCoords.x + 25;
        console.log(`randomized X coord: ${x}`)

        let y: number = (Math.random() * (this.arcadeAreaCoords.width - this.arcadeAreaCoords.y + 1 - 60 - 50)) + this.arcadeAreaCoords.y + 30 + 25;
        console.log(`randomized Y coord: ${y}`)

        // blockSword sprite is 60x161, rotated 90deg → occupies 161x60 in world
        const block1LeftX: number = SCREEN_CENTER.x - 5 - 161/2;
        const block1RightX: number = SCREEN_CENTER.x - 5 + 161/2;
        // Canvas Y grows downward; "Top" name predates that convention but values are correct
        const block1TopY: number = 200 + 60/2;
        const block1BotY: number = 200 - 60/2;
        console.log(`BLOCK1 from ${block1LeftX} ${block1TopY} to ${block1RightX} ${block1BotY}`)
        if ((x > block1LeftX && x < block1RightX) && (y > block1BotY && y < block1TopY)) {
            const arcadeAreaCenterY = this.arcadeAreaCoords.y + this.arcadeAreaCoords.height / 2;
            const verticalOffset = ((y - arcadeAreaCenterY - 100 - 30/2) + 20)
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
        const answer = this.add.image(Pos.x, Pos.y, Emoji);
        answer.setDepth(1);
        this.emojisImages.add(answer);
    }

    showAskingUI()
    {
        console.log(`showAskingUI fired at ${this.time.now}`)
        const QAndA = this.qAndA;
        const Emojis = this.emojis;
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

    musicSwitchTrack1to2()
    {
        if (this.currentMusicTrack === 2) {
            // Already on track 2; the SFX still plays as a wrong-answer cue.
            this.sound.play('crack-head');
            return;
        }
        this.currentMusicTrack = 2;
        const beat: number = this.music1.seek % 1.5;
        this.time.delayedCall(Math.min(beat, (1.5 - beat)), () => {
            const playbackTime: number = this.music1.seek;
            this.music1.stop();
            this.music2.setSeek(playbackTime);
            this.sound.play('crack-head');
            this.music2.play();
        });
    }

    musicSwitchTrack2to1()
    {
        if (this.currentMusicTrack === 1) {
            return;
        }
        this.currentMusicTrack = 1;
        const beat: number = this.music2.seek % 1.5;
        this.time.delayedCall(Math.min(beat, (1.5 - beat)), () => {
            const playbackTime: number = this.music2.seek;
            this.music2.stop();
            this.music1.setSeek(playbackTime);
            this.music1.play();
        });
    }
    // Returns true if game-over was triggered (caller should stop further work).
    progressSus(): boolean
    {
        this.scales[this.currentSus].setAlpha(0);
        this.demons[this.currentSus].setAlpha(0);
        this.skels[this.currentSus].setAlpha(0);

        this.currentSus += 1;
        console.log(`progressSus: currentSus = ${this.currentSus}`)

        if (this.currentSus >= 4) {
            this.scene.start('GameOver');
            return true;
        }

        this.scales[this.currentSus].setAlpha(1);
        this.demons[this.currentSus].setAlpha(1);
        this.skels[this.currentSus].setAlpha(1);
        return false;
    }

    hideAskingUI() {
        console.log(`hideAskingUI fired at ${this.time.now}`)
        this.bubblePlayer.setAlpha(0);
        this.bubbleEnemy.setAlpha(0);
        this.emojisImages.clear(false, true);
        this.rightAnswerKey = undefined;
        this.rightAnswerKey2 = undefined;
        this.wrongAnswer1Key = undefined;
        this.wrongAnswer1Key2 = undefined;
        this.wrongAnswer2Key = undefined;
        this.wrongAnswer2Key2 = undefined;
    }

    init() {
        this.currentMusicTrack = 1;

        this.currentSus = 0;

        this.handMoveDirection = Direction.Left;

        this.lootAmount = 0;
        this.collectedLootCount = 0;

        this.dialogueFSM = new StateMachine<DialogueStateName, DialogueArgs>(
            'idle',
            {
                idle: new IdleState(),
                asking: new AskingState(),
                cooldown: new CooldownState(),
            },
            [this],
        );
    }

    create ()
    {
        if (!this.music1) {
            console.log(`creating music track 1`)
            this.music1 = this.sound.add('music1', { loop: true }) as GameSound;
        }
        if (!this.music2) {
            console.log(`creating music track 2`)
            this.music2 = this.sound.add('music2', { loop: true }) as GameSound;
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

        this.scales = [
            this.add.image(1100, 50, 'scale1'),
            this.add.image(1100, 50, 'scale2'),
            this.add.image(1100, 50, 'scale3'),
            this.add.image(1100, 50, 'scale4'),
        ];
        this.scales.slice(1).forEach(s => s.setAlpha(0));
        console.log(`after creation SUS SCALE: ${this.currentSus}`)

        this.demons = [
            this.add.image(1100, 410, 'demon1'),
            this.add.image(1100, 410, 'demon2'),
            this.add.image(1100, 410, 'demon3'),
            this.add.image(1100, 410, 'demon4'),
        ];
        this.demons.slice(1).forEach(d => d.setAlpha(0));

        this.skels = [
            this.add.image(200, 400, 'skel1'),
            this.add.image(200, 400, 'skel2'),
            this.add.image(200, 400, 'skel3'),
            this.add.image(200, 400, 'skel4'),
        ];
        this.skels.slice(1).forEach(s => s.setAlpha(0));

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
        this.handMoveDirection = Direction.Left;
        this.hand.setVelocityX(-300);

        this.physics.add.collider(this.hand, this.blocks, () => {
            this.scene.start('GameOver');
        });

        this.lootSprites = ['loot1', 'loot2', 'loot3', 'loot4'];
        this.lootScoreMsg = this.add.text(
            50,
            5,
            `${this.collectedLootCount}`,
            {
                fontFamily: 'Architects Daughter',
                fontSize: '96px',
                color: '#44323f'
            }
        );
        this.lootAmount +=1;
        this.spawnLoot();
        console.log(`we have ${this.lootAmount} of loot in (after) CREATE`)

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        this.dialogueFSM.step();

        // Create LOOT
        if (this.lootAmount === 0) {
            console.log(`we DONT HAVE any loot in UPDATE`)
            this.lootAmount += 1;
            this.time.delayedCall(1000, () => {
                this.spawnLoot();
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
                this.hand.setSize(106, 67);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-300);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Right;
                this.hand.setSize(106, 67);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(300);
            }
        }
        else if (this.cursors.up.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Up;
                this.hand.setSize(67, 106);
                this.hand.angle = 90;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(-300);
            }
        }
        else if (this.cursors.down.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Down;
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
        // SoundManager is game-scoped, so sounds keep playing past scene
        // shutdown unless explicitly stopped. Everything else (display list,
        // physics world, time clock, input plugin) Phaser resets for us.
        this.music1.stop();
        this.music2.stop();
    }
}
