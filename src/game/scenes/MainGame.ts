import { Scene } from 'phaser';

import {
    GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER,
    ARCADE_AREA_CENTER, ARCADE_AREA_LAYOUT, LOOT_SIZE,
    HAND_SPEED,
    MUSIC_CALM, MUSIC_ALARM,
    MENU_CURSOR,
    LEVELS, CURRENT_LEVEL_INDEX,
    LOOT_METER_ANCHOR, LOOT_METER_CELL_WIDTH, LOOT_METER_CELL_HEIGHT,
    LOOT_METER_CELL_GAP, LOOT_METER_FILL_COLOR, LOOT_METER_EMPTY_COLOR,
    LOOT_METER_STROKE_COLOR,
    Pos, Direction,
} from '../config.ts';
import { StateMachine } from '../../lib/StateMachine.ts';
import { MusicController } from '../MusicController.ts';
import { log } from '../debug.ts';
import { shuffle } from '../../lib/utils.ts';
import {
    IdleState, AskingState, CooldownState,
    type DialogueStateName, type DialogueArgs,
} from './dialogue-states.ts';

const letterKeyCodes: Record<string, number> = {
    'S': 83,
    'D': 68,
    'F': 70,
};

// Hack codes for layout-independent fallbacks (Cyrillic-layout keyboards
// don't trigger S/D/F by keycode; these alternate codes happen to land on
// the same physical keys on common Russian QWERTY layouts).
const hackLetterCodes: Record<string, number> = {
    'S': 79, // O
    'D': 69, // E
    'F': 85, // U
};

// Visual warning underlay for a danger hitbox. Walks the rectangle's perimeter
// in segments and perturbs each point outward by a few px, drawn as one closed
// polygon — looks like torn warning tape. Outward-only so the visible shape
// is always >= the actual hitbox (no graze surprises). Generated once at
// create-time; rendered as a static draw thereafter.
function jaggedHitboxUnderlay(
    scene: Scene,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
): Phaser.GameObjects.Graphics {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const top = centerY - height / 2;
    const bottom = centerY + height / 2;

    const segmentsPerEdge = 12;
    const jitter = 6; // max outward perturbation in px

    const points: number[] = [];

    // Top edge: left → right, perturb y upward (smaller y).
    for (let i = 0; i <= segmentsPerEdge; i++) {
        const t = i / segmentsPerEdge;
        points.push(left + (right - left) * t, top - Math.random() * jitter);
    }
    // Right edge: top → bottom, perturb x outward (larger x).
    for (let i = 1; i <= segmentsPerEdge; i++) {
        const t = i / segmentsPerEdge;
        points.push(right + Math.random() * jitter, top + (bottom - top) * t);
    }
    // Bottom edge: right → left, perturb y outward (larger y).
    for (let i = 1; i <= segmentsPerEdge; i++) {
        const t = i / segmentsPerEdge;
        points.push(right - (right - left) * t, bottom + Math.random() * jitter);
    }
    // Left edge: bottom → top, perturb x outward (smaller x).
    for (let i = 1; i < segmentsPerEdge; i++) {
        const t = i / segmentsPerEdge;
        points.push(left - Math.random() * jitter, bottom - (bottom - top) * t);
    }

    const g = scene.add.graphics();
    g.fillStyle(0xff0000, 0.5);
    g.beginPath();
    g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) {
        g.lineTo(points[i], points[i + 1]);
    }
    g.closePath();
    g.fillPath();
    return g;
}

export class MainGame extends Scene
{
    music: MusicController;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    rightAnswerKey?: Phaser.Input.Keyboard.Key;
    wrongAnswer1Key?: Phaser.Input.Keyboard.Key;
    wrongAnswer2Key?: Phaser.Input.Keyboard.Key;

    rightAnswerKey2?: Phaser.Input.Keyboard.Key;
    wrongAnswer1Key2?: Phaser.Input.Keyboard.Key;
    wrongAnswer2Key2?: Phaser.Input.Keyboard.Key;

    bubblePlayer: Phaser.GameObjects.Image;
    bubbleEnemy: Phaser.GameObjects.Image;
    emojis: string[];
    emojisImages: Phaser.GameObjects.Group;
    qAndA: Record<string, string>;
    answerKeysLetters: Array<string>;

    dialogueFSM: StateMachine<DialogueStateName, DialogueArgs>;

    scales: Phaser.GameObjects.Image[];
    demons: Phaser.GameObjects.Image[];
    skels: Phaser.GameObjects.Image[];
    currentSus: number;

    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    handVis: Phaser.GameObjects.Graphics;
    handMoveDirection: Direction;

    lootSprites: Array<string>;
    lootAmount: number;
    collectedLootCount: number;
    lootMeterCells: Phaser.GameObjects.Rectangle[];

    constructor ()
    {
        super('MainGame');
    }

    private getLootRandomPos(): Pos
    {
        const x: number = (Math.random() * ARCADE_AREA_LAYOUT.width) + ARCADE_AREA_LAYOUT.x;
        log.loot(`randomized X coord: ${x}`)

        let y: number = (Math.random() * ARCADE_AREA_LAYOUT.height) + ARCADE_AREA_LAYOUT.y;
        log.loot(`randomized Y coord: ${y}`)

        // blockSword: native 60x161, rotated 90° → 161x60 in world.
        // Inflate bounds by half the loot sprite size so the loot's visual
        // box (not just its center) doesn't overlap the block.
        const blockLeftX:  number = SCREEN_CENTER.x - 5 - 161/2 - LOOT_SIZE.width/2;
        const blockRightX: number = SCREEN_CENTER.x - 5 + 161/2 + LOOT_SIZE.width/2;
        const blockTopY:   number = 200 - 60/2 - LOOT_SIZE.height/2;
        const blockBotY:   number = 200 + 60/2 + LOOT_SIZE.height/2;
        log.loot(`block-keepout from (${blockLeftX}, ${blockTopY}) to (${blockRightX}, ${blockBotY})`)
        if (x > blockLeftX && x < blockRightX && y > blockTopY && y < blockBotY) {
            // Inside keep-out: push y upward (smaller y) past the block top.
            const verticalOffset = (y - blockTopY) + 40;
            log.loot(`loot inside block keep-out, lifting by ${verticalOffset}`)
            y -= verticalOffset;
        }

        return { x, y };
    }

    private spawnLoot() {
        const lootPos: Pos = this.getLootRandomPos();
        log.loot(`SPAWNING loot at (${lootPos.x}, ${lootPos.y})`)
        const lootPic = this.lootSprites[Math.floor(Math.random()*4)];
        const loot = this.physics.add.sprite(lootPos.x, lootPos.y, lootPic);
        this.physics.add.collider(loot, this.hand, () => {
            loot.destroy();
            this.lootAmount -= 1;
            this.collectedLootCount += 1;
            if (this.hand.body.velocity.x !== 0) {
                if (this.hand.body.velocity.x > 0) {
                    this.hand.body.setVelocityX(HAND_SPEED);
                }
                else {
                    this.hand.body.setVelocityX(-HAND_SPEED);
                }

            }
            if (this.hand.body.velocity.y !== 0) {
                if (this.hand.body.velocity.y > 0) {
                    this.hand.body.setVelocityY(HAND_SPEED);
                }
                else {
                    this.hand.body.setVelocityY(-HAND_SPEED);
                }

            }
            this.updateLootMeter();
            // Win trigger fires the moment the target is hit. Count-driven,
            // not timer-driven — when the level-timer pass lands, it will
            // own the LOSE-on-expiry path (timer up && count < target) but
            // the WIN path stays here. `>=` over `===` is defensive against
            // any future code path that increments by >1 in one frame.
            if (this.collectedLootCount >= LEVELS[CURRENT_LEVEL_INDEX].lootTarget) {
                this.scene.pause();
                this.scene.launch('Win');
            }
        });
    }

    // Player hitbox indicator. Stroked rect outline + filled center dot,
    // centered on origin so handVis.x/y mirroring the hand's position keeps
    // the visualization aligned with the body. The dot stays put as the
    // rectangle swaps W↔H on direction change, giving the player a stable
    // focal point for where they actually are.
    private redrawHandVis(width: number, height: number) {
        this.handVis.clear();
        this.handVis.lineStyle(3, 0x66ff44, 0.9);
        this.handVis.strokeRect(-width / 2, -height / 2, width, height);
        this.handVis.fillStyle(0x66ff44, 0.9);
        this.handVis.fillCircle(0, 0, 3);
    }

    // Build the segmented loot meter for the current level. One Rectangle per
    // loot item required to win. Each Rectangle's origin is set to (0, 0) so
    // LOOT_METER_ANCHOR is the top-left of the first cell — the layout math
    // below treats anchor as a top-left coordinate, not Phaser's default
    // center anchor.
    private createLootMeter(): Phaser.GameObjects.Rectangle[] {
        const cfg = LEVELS[CURRENT_LEVEL_INDEX];
        const cells: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < cfg.lootTarget; i++) {
            const x = LOOT_METER_ANCHOR.x
                + i * (LOOT_METER_CELL_WIDTH + LOOT_METER_CELL_GAP);
            const cell = this.add.rectangle(
                x, LOOT_METER_ANCHOR.y,
                LOOT_METER_CELL_WIDTH, LOOT_METER_CELL_HEIGHT,
                LOOT_METER_EMPTY_COLOR,
            );
            cell.setOrigin(0, 0);
            cell.setStrokeStyle(2, LOOT_METER_STROKE_COLOR);
            cells.push(cell);
        }
        return cells;
    }

    // Re-render the meter against the current collectedLootCount. Forgiving
    // by construction: collectedLootCount > lootTarget renders all cells full
    // (excess is invisible); negative collectedLootCount renders all empty
    // (the loop predicate is always false). Stun-decrement code is expected
    // to floor at 0 anyway.
    private updateLootMeter(): void {
        for (let i = 0; i < this.lootMeterCells.length; i++) {
            const filled = i < this.collectedLootCount;
            this.lootMeterCells[i].setFillStyle(
                filled ? LOOT_METER_FILL_COLOR : LOOT_METER_EMPTY_COLOR,
            );
        }
    }

    private answerConstructor(Pos: Pos, Letter: string, Emoji: string)
    {
        log.dialogue(`answer constructor fired for letter ${Letter} at ${this.time.now}`)
        const answer = this.add.image(Pos.x, Pos.y, Emoji);
        answer.setDepth(1);
        this.emojisImages.add(answer);
    }

    showAskingUI(onReady: () => void)
    {
        log.dialogue(`showAskingUI fired at ${this.time.now}`)
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
                if (i === answers.length - 1) {
                    // Last answer rendered: now bind keys and signal ready.
                    // Player physically cannot press an answer key before this
                    // point, so the answer-eligibility window starts here.
                    this.bindAnswerKeys(rightLetter);
                    onReady();
                }
            });
            if (i == rightNumber) {
                rightLetter = this.answerKeysLetters[i];
            }
            delay += 100;
        };
        log.dialogue(`time after answers construction loop is ${this.time.now}`)
    }

    private bindAnswerKeys(rightLetter: string): void {
        for (const letter in letterKeyCodes) {
            const keyCode: number = letterKeyCodes[letter];
            const hackKeyCode: number = hackLetterCodes[letter];
            if (this.input.keyboard) {
                if (letter === rightLetter) {
                    log.dialogue(`right answer is ${letter}`);
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

    // Returns true if game-over was triggered (caller should stop further work).
    progressSus(): boolean
    {
        this.scales[this.currentSus].setAlpha(0);
        this.demons[this.currentSus].setAlpha(0);
        this.skels[this.currentSus].setAlpha(0);

        this.currentSus += 1;
        log.sus(`progressSus: currentSus = ${this.currentSus}`)

        if (this.currentSus >= 4) {
            this.scene.pause();
            this.scene.launch('GameOver');
            return true;
        }

        this.scales[this.currentSus].setAlpha(1);
        this.demons[this.currentSus].setAlpha(1);
        this.skels[this.currentSus].setAlpha(1);
        return false;
    }

    hideAskingUI() {
        log.dialogue(`hideAskingUI fired at ${this.time.now}`)
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
        this.input.setDefaultCursor(MENU_CURSOR);

        log.music(`registering music tracks`)
        this.music = new MusicController(this);
        this.music.register(MUSIC_CALM, { loop: true });
        this.music.register(MUSIC_ALARM, { loop: true });
        this.music.play(MUSIC_CALM);

        this.cameras.main.setBackgroundColor(0xff00ff);

        this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'table');

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
        log.sus(`after creation SUS SCALE: ${this.currentSus}`)

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

        const blocks = this.physics.add.group({ immovable: true });

        jaggedHitboxUnderlay(this, SCREEN_CENTER.x, 1, 600, 100);
        const block1 = this.add.rectangle(SCREEN_CENTER.x, 1, 600, 100, 0xff0000, 0);
        blocks.add(block1);

        jaggedHitboxUnderlay(this, SCREEN_CENTER.x, GAME_HEIGHT - 120, 600, 100);
        const block2 = this.add.rectangle(SCREEN_CENTER.x, (GAME_HEIGHT - 120), 600, 100, 0xff0000, 0);
        blocks.add(block2);

        // sword sprite is 60x161, rotated 90deg → 161x60 in world
        jaggedHitboxUnderlay(this, ARCADE_AREA_CENTER.x, 200, 161, 60);
        const blockSword = this.physics.add.sprite(ARCADE_AREA_CENTER.x, 200, 'block8');
        blockSword.angle = 90;
        blockSword.setSize(161, 60);
        blocks.add(blockSword);

        // 106x67
        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 50, 'hand');
        this.handMoveDirection = Direction.Left;
        this.hand.setVelocityX(-HAND_SPEED);

        this.handVis = this.add.graphics();
        this.redrawHandVis(106, 67);

        this.physics.add.collider(this.hand, blocks, () => {
            this.scene.pause();
            this.scene.launch('GameOver');
        });

        this.lootSprites = ['loot1', 'loot2', 'loot3', 'loot4'];
        this.lootMeterCells = this.createLootMeter();
        this.lootAmount +=1;
        this.spawnLoot();
        log.loot(`we have ${this.lootAmount} of loot in (after) CREATE`)

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.input.keyboard.on('keydown-ESC', () => this.pauseGame());
        }

        // Pause button — bottom-right corner, well clear of the suspicion
        // meter (top-right) and the demon character.
        const pauseBtn = this.add.image(GAME_WIDTH - 50, GAME_HEIGHT - 50, 'pause');
        pauseBtn.setDepth(2);
        pauseBtn.setInteractive();
        pauseBtn.on('pointerdown', () => this.pauseGame());
    }

    private pauseGame()
    {
        this.scene.pause();
        this.scene.launch('Pause');
    }

    update()
    {
        this.dialogueFSM.step();

        // Create LOOT
        if (this.lootAmount === 0) {
            log.loot(`we DONT HAVE any loot in UPDATE`)
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
                this.redrawHandVis(106, 67);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-HAND_SPEED);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Right;
                this.hand.setSize(106, 67);
                this.redrawHandVis(106, 67);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(HAND_SPEED);
            }
        }
        else if (this.cursors.up.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Up;
                this.hand.setSize(67, 106);
                this.redrawHandVis(67, 106);
                this.hand.angle = 90;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(-HAND_SPEED);
            }
        }
        else if (this.cursors.down.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Down;
                this.hand.setSize(67, 106);
                this.redrawHandVis(67, 106);
                this.hand.angle = 270;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(HAND_SPEED);
            }
        }

        // Track hand position (drawn shape is centered on origin).
        this.handVis.x = this.hand.x;
        this.handVis.y = this.hand.y;
    }

    shutdown()
    {
        // SoundManager is game-scoped, so sounds keep playing past scene
        // shutdown unless explicitly stopped. Everything else (display list,
        // physics world, time clock, input plugin) Phaser resets for us.
        this.music.stopAll();
    }
}
