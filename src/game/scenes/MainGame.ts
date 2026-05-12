import { Scene } from 'phaser';

import {
    GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER,
    ARCADE_AREA_CENTER, ARCADE_AREA_LAYOUT, LOOT_SIZE,
    HAND_SPEED,
    MUSIC_CALM, MUSIC_ALARM,
    MENU_CURSOR,
    LEVELS, CURRENT_LEVEL_INDEX,
    LOOT_METER_ANCHOR, LOOT_METER_CELL_WIDTH, LOOT_METER_CELL_HEIGHT,
    LOOT_METER_CELL_GAP, LOOT_METER_ROW_LENGTH, LOOT_METER_FILL_COLOR,
    LOOT_METER_EMPTY_COLOR, LOOT_METER_STROKE_COLOR,
    Pos,
} from '../config.ts';
import {
    LeftState, RightState, UpState, DownState, StunnedState,
    type HandStateName, type HandArgs,
} from './hand-states.ts';
import { StateMachine } from '../../lib/StateMachine.ts';
import { MusicController } from '../MusicController.ts';
import { loadSettings, saveSettings, effectiveVolume } from '../settings.ts';
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
    handFSM: StateMachine<HandStateName, HandArgs>;

    scales: Phaser.GameObjects.Image[];
    demons: Phaser.GameObjects.Image[];
    skels: Phaser.GameObjects.Image[];
    currentSus: number;

    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    handVis: Phaser.GameObjects.Graphics;
    // FSM-state name of the last direction the hand moved in (set by each
    // direction state's enter handler). Read by StunnedState on timer
    // expiry to pick the bounce-back direction. Initialized in init() to
    // match the level-start direction.
    lastDirection: HandStateName;

    lootSprites: Array<string>;
    lootAmount: number;
    collectedLootCount: number;
    lootMeterCells: Phaser.GameObjects.Rectangle[];
    // Effective per-level loot target. Read once in init() from either
    // settings.lootTargetOverride (DEV builds, when set) or the LEVELS
    // config default. Single source of truth for the meter renderer and
    // the win check — they cannot desync.
    levelLootTarget: number;
    // Effective per-level time limit (seconds). Same override pattern as
    // levelLootTarget. Drives both the delayedCall that triggers GameOver
    // on expiry AND the countdown text refresh in update().
    levelTimerSeconds: number;
    levelTimer: Phaser.Time.TimerEvent;
    timerText: Phaser.GameObjects.Text;
    muteBtn: Phaser.GameObjects.Text;
    // True after endLevel() fires once. Guards update() so the same frame
    // can't keep mutating hand direction / scheduling loot respawns / re-
    // reading the cancelled timer after the level is logically over, and
    // also makes endLevel() itself idempotent against double-fire (e.g. a
    // pickup-triggered Win on the same frame the timer expires to GameOver).
    ended: boolean;

    constructor ()
    {
        super('MainGame');
    }

    private getLootRandomPos(): Pos
    {
        // Static block (sword) keep-out: 60x161 native, rotated 90° → 161x60.
        // Inflate by half a loot piece so loot's visual box doesn't overlap.
        const blockLeftX:  number = SCREEN_CENTER.x - 5 - 161/2 - LOOT_SIZE.width/2;
        const blockRightX: number = SCREEN_CENTER.x - 5 + 161/2 + LOOT_SIZE.width/2;
        const blockTopY:   number = 200 - 60/2 - LOOT_SIZE.height/2;
        const blockBotY:   number = 200 + 60/2 + LOOT_SIZE.height/2;

        // Bounded resample loop for the dynamic hand keep-out. The hand AABB
        // can swap dimensions (106x67 ↔ 67x106) and move every frame, so we
        // can't push to a deterministic safe direction the way the block does.
        // Resampling is fine: hand keep-out area is ~20% of the arcade area,
        // so the probability of needing >5 attempts is <0.04%. Fallback after
        // MAX_ATTEMPTS returns the last sampled pos — graceful degrade, no
        // crash; in practice unreachable.
        const MAX_ATTEMPTS = 20;
        let x = 0, y = 0;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            x = (Math.random() * ARCADE_AREA_LAYOUT.width) + ARCADE_AREA_LAYOUT.x;
            y = (Math.random() * ARCADE_AREA_LAYOUT.height) + ARCADE_AREA_LAYOUT.y;

            // Block keep-out: deterministic upward push (block is fixed, room above).
            if (x > blockLeftX && x < blockRightX && y > blockTopY && y < blockBotY) {
                const verticalOffset = (y - blockTopY) + 40;
                log.loot(`attempt ${attempt+1}: lifting past block keep-out by ${verticalOffset}`);
                y -= verticalOffset;
            }

            if (this.isInsideHandKeepout(x, y)) {
                log.loot(`attempt ${attempt+1}: (${x.toFixed(0)}, ${y.toFixed(0)}) inside hand keep-out, resampling`);
                continue;
            }

            return { x, y };
        }

        log.loot(`MAX_ATTEMPTS exhausted, returning (${x.toFixed(0)}, ${y.toFixed(0)})`);
        return { x, y };
    }

    // Inflated AABB around the hand's physics body. Padding = LOOT_SIZE on
    // each side: forbids loot center within (hand_half + loot_w) of hand
    // center, giving ~half a loot-piece of edge-to-edge breathing room.
    // Prevents the "loot spawns on top of the hand and gets collected next
    // frame" jankiness — count visibly jumps with no visible pickup.
    private isInsideHandKeepout(x: number, y: number): boolean {
        const cx = this.hand.body.center.x;
        const cy = this.hand.body.center.y;
        const halfW = this.hand.body.width / 2 + LOOT_SIZE.width;
        const halfH = this.hand.body.height / 2 + LOOT_SIZE.height;
        return (
            x > cx - halfW && x < cx + halfW &&
            y > cy - halfH && y < cy + halfH
        );
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
            if (this.collectedLootCount >= this.levelLootTarget) {
                this.endLevel('Win');
            }
        });
    }

    // Player hitbox indicator. Stroked rect outline + filled center dot,
    // centered on origin so handVis.x/y mirroring the hand's position keeps
    // the visualization aligned with the body. The dot stays put as the
    // rectangle swaps W↔H on direction change, giving the player a stable
    // focal point for where they actually are.
    redrawHandVis(width: number, height: number) {
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
    // center anchor. Cells wrap to a new row every LOOT_METER_ROW_LENGTH so
    // the HUD stays compact at high loot targets (DEV tuner allows up to 25).
    private createLootMeter(): Phaser.GameObjects.Rectangle[] {
        const cells: Phaser.GameObjects.Rectangle[] = [];
        for (let i = 0; i < this.levelLootTarget; i++) {
            const col = i % LOOT_METER_ROW_LENGTH;
            const row = Math.floor(i / LOOT_METER_ROW_LENGTH);
            const x = LOOT_METER_ANCHOR.x
                + col * (LOOT_METER_CELL_WIDTH + LOOT_METER_CELL_GAP);
            const y = LOOT_METER_ANCHOR.y
                + row * (LOOT_METER_CELL_HEIGHT + LOOT_METER_CELL_GAP);
            const cell = this.add.rectangle(
                x, y,
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
    updateLootMeter(): void {
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
            this.endLevel('GameOver');
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
        this.ended = false;
        this.currentSus = 0;

        this.lastDirection = 'left';

        this.lootAmount = 0;
        this.collectedLootCount = 0;

        // Compute effective loot target for this level. The dev-only override
        // (loot tuner row in Settings) is double-gated: must be a DEV build
        // (Vite-stripped in production) AND must be a non-null value in
        // localStorage. Otherwise fall through to the configured per-level
        // default.
        const settings = loadSettings();
        const lootOverrideActive = import.meta.env.DEV && settings.lootTargetOverride !== null;
        this.levelLootTarget = lootOverrideActive
            ? settings.lootTargetOverride as number
            : LEVELS[CURRENT_LEVEL_INDEX].lootTarget;
        const timerOverrideActive = import.meta.env.DEV && settings.timerOverride !== null;
        this.levelTimerSeconds = timerOverrideActive
            ? settings.timerOverride as number
            : LEVELS[CURRENT_LEVEL_INDEX].timerSeconds;

        this.dialogueFSM = new StateMachine<DialogueStateName, DialogueArgs>(
            'idle',
            {
                idle: new IdleState(),
                asking: new AskingState(),
                cooldown: new CooldownState(),
            },
            [this],
        );

        this.handFSM = new StateMachine<HandStateName, HandArgs>(
            'left',
            {
                left:    new LeftState(),
                right:   new RightState(),
                up:      new UpState(),
                down:    new DownState(),
                stunned: new StunnedState(),
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
        this.handVis = this.add.graphics();

        // Wire the FSM and step once so LeftState.enter() runs now —
        // applies setSize/angle/flipX/velocity to the freshly-created hand
        // sprite. Without this, the sprite would have no velocity for one
        // frame between create() finishing and update() running.
        this.handFSM.step();

        // Collision → stun (replaces the previous instant-death). Two
        // guards: `ended` so endLevel-fired-but-not-yet-paused doesn't
        // re-trigger; `isCurrent('stunned')` so Phaser's per-frame collider
        // re-fire while bodies still overlap during the 1s freeze doesn't
        // chain into a re-stun.
        this.physics.add.collider(this.hand, blocks, () => {
            if (this.ended) return;
            if (this.handFSM.is('stunned')) return;
            this.handFSM.transition('stunned');
        });

        this.lootSprites = ['loot1', 'loot2', 'loot3', 'loot4'];
        this.lootMeterCells = this.createLootMeter();
        this.lootAmount +=1;
        this.spawnLoot();
        log.loot(`we have ${this.lootAmount} of loot in (after) CREATE`)

        // Level timer. Sits over the lower portion of the bottom wall
        // (centered at y=630) — the wall (centered at y=600) is painted
        // with the translucent-red jaggedHitboxUnderlay danger visual, so
        // the timer needs a dark card behind it for the red text to read.
        // Card is HUD-palette purple (#44323f), matching the loot meter
        // stroke and the settings buttons.
        //
        // The delayedCall fires GameOver on expiry; endLevel() cancels it on
        // any other end path (Win, suspicion overflow, obstacle collision)
        // so it can't double-trigger. update() refreshes the displayed
        // countdown from the live remaining-seconds. Phaser's per-scene time
        // clock pauses with the scene (ESC pause), so no extra wiring needed.
        this.levelTimer = this.time.delayedCall(
            this.levelTimerSeconds * 1000,
            () => this.endLevel('GameOver'),
        );
        // Background card. Added BEFORE the text so display-list order puts
        // it behind without needing setDepth gymnastics. Sized to fit
        // through "5:00" (TIMER_MAX = 300s in settings) at 72px.
        this.add.rectangle(SCREEN_CENTER.x, 630, 220, 100, 0x44323f)
            .setOrigin(0.5)
            .setStrokeStyle(2, 0x000000);
        this.timerText = this.add.text(
            SCREEN_CENTER.x, 630,
            this.formatTime(this.levelTimerSeconds),
            {
                fontFamily: 'Architects Daughter',
                fontSize: '72px',
                fontStyle: 'bold',
                color: '#dd1100',
                stroke: '#440000',
                strokeThickness: 6,
            },
        ).setOrigin(0.5);

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

        // Mute button — paired with pause in the bottom-right "player
        // controls" corner. Text-emoji placeholder until art arrives; swap
        // for an Image with mute-on/mute-off textures when delivered.
        const muted = loadSettings().muted;
        // Pause sprite is 59x57 centered at GAME_WIDTH - 50, so its left edge
        // sits at ~1200. Mute emoji (~48px wide, center origin) at
        // GAME_WIDTH - 130 puts its right edge at ~1174 — ~26px gap.
        this.muteBtn = this.add.text(
            GAME_WIDTH - 130, GAME_HEIGHT - 50,
            muted ? '🔇' : '🔊',
            { fontFamily: 'Architects Daughter', fontSize: '48px', color: '#44323f' },
        ).setOrigin(0.5).setDepth(2);
        this.muteBtn.setInteractive();
        this.muteBtn.on('pointerdown', () => this.toggleMute());

        // Apply music volume from settings now that all tracks are registered
        // and the calm track has started. setVolume works regardless of play
        // state so order within create() doesn't matter, but doing it last
        // matches the "settings are the final word" mental model.
        this.music.setVolume(effectiveVolume(loadSettings(), 'music'));
    }

    private toggleMute(): void {
        const settings = loadSettings();
        settings.muted = !settings.muted;
        saveSettings(settings);
        this.muteBtn.setText(settings.muted ? '🔇' : '🔊');
        // Music re-applies live; SFX picks up the new value on the next
        // sound.play call (which re-reads loadSettings each time).
        this.music.setVolume(effectiveVolume(settings, 'music'));
    }

    private pauseGame()
    {
        this.scene.pause();
        this.scene.launch('Pause');
    }

    // Single exit point for "the level has ended" transitions — either via
    // a loss path (sus full, block crash, timer expiry) or the win path
    // (loot target hit). Pause the scene, stop all music (scene.pause alone
    // doesn't stop sound because the SoundManager is game-scoped, not
    // scene-scoped — handled here via this.music.stopAll), then launch the
    // appropriate overlay.
    //
    // pauseGame (the player-triggered ESC pause) intentionally does NOT route
    // through here — it preserves music for continuity when the player
    // resumes mid-game.
    private endLevel(target: 'GameOver' | 'Win'): void {
        // Idempotency guard. Without this, a near-simultaneous Win-from-
        // pickup + GameOver-from-timer (or any double-trigger) would launch
        // both overlays on top of each other. The `ended` flag also gates
        // update() so the same frame can't keep mutating game state.
        if (this.ended) {
            return;
        }
        this.ended = true;
        // Cancel the level timer so a scene-pause-then-expiry path can't
        // re-fire GameOver after we've already routed to Win.
        this.levelTimer?.remove();
        this.scene.pause();
        this.music.stopAll();
        this.scene.launch(target);
    }

    private formatTime(seconds: number): string {
        const t = Math.max(0, Math.ceil(seconds));
        const m = Math.floor(t / 60);
        const s = t % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    update()
    {
        // Early-out after endLevel(). Phaser pauses the scene asynchronously,
        // so update() can continue running on the same frame that endLevel
        // fired — the remaining body would then mutate hand direction,
        // schedule another loot respawn, and read a just-removed timer.
        if (this.ended) {
            return;
        }

        this.dialogueFSM.step();
        this.handFSM.step();

        // Refresh the timer countdown. getRemainingSeconds() returns the live
        // remaining time from Phaser's pause-aware clock; formatTime ceil's
        // it so the displayed "1:00" stays visible for the full first second
        // (rather than flicking to "0:59" at elapsed=0.001s).
        this.timerText.setText(this.formatTime(this.levelTimer.getRemainingSeconds()));

        // Create LOOT
        if (this.lootAmount === 0) {
            log.loot(`we DONT HAVE any loot in UPDATE`)
            this.lootAmount += 1;
            this.time.delayedCall(1000, () => {
                this.spawnLoot();
            })
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
