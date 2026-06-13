import { Scene } from 'phaser';

import {
    GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER,
    ARCADE_AREA_CENTER, ARCADE_AREA_LAYOUT, LOOT_SIZE,
    HAND_SPEED,
    STASH_TRIGGER_SIZE,
    SUS_LEVELS, SUS_BASELINE, MUSIC_HALF_TACT_SECONDS,
    MENU_CURSOR,
    LEVELS, CURRENT_LEVEL_INDEX,
    LOOT_METER_ANCHOR, LOOT_METER_CELL_WIDTH, LOOT_METER_CELL_HEIGHT,
    LOOT_METER_CELL_GAP, LOOT_METER_ROW_LENGTH, LOOT_METER_FILL_COLOR,
    LOOT_METER_EMPTY_COLOR, LOOT_METER_STROKE_COLOR,
    Pos,
} from '../config.ts';
import {
    LeftState, RightState, UpState, DownState, StunnedState, HiddenState,
    type HandStateName, type HandArgs,
} from './hand-states.ts';
import { StateMachine } from '../../lib/StateMachine.ts';
import { MusicController } from '../MusicController.ts';
import { loadSettings, saveSettings, effectiveVolume } from '../settings.ts';
import { log } from '../debug.ts';
import { shuffle } from '../../lib/utils.ts';
import {
    IdleState, AskingState, CooldownState, LookAtTableState,
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

// Look-at-table reaction indicator: a red draining bar under the demon +
// a "hide!" caption under the bar. The bar mirrors the stun indicator's
// drain (scaleX 1->0 from center) but red and larger, draining over the
// reaction window. Positions are hand-tuning knobs — tweak and reload,
// same workflow as the look-over sprite (DEV: hold it with key 3 to study
// the layout statically).
const LOOK_BAR_POS: Pos = { x: 1080, y: 470 };
const LOOK_BAR_WIDTH = 220;
const LOOK_BAR_HEIGHT = 16;
const LOOK_BAR_COLOR = 0xff2200;
const LOOK_CAPTION_POS: Pos = { x: 1080, y: 512 };
const LOOK_CAPTION_TEXT = 'hide!';

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
    // Staged-reveal timers from showAskingUI (bubbles, question, answers).
    // Captured so hideAskingUI can cancel them: an alarm fired by a wall
    // stun can force-exit AskingState DURING the 0-900ms staging window,
    // and uncancelled stage callbacks would paint dialogue UI into the
    // reaction state (the alarm design's R4 caveat, now reachable).
    askingStagingTimers: Phaser.Time.TimerEvent[];
    // The dialogue FSM's advance timers (idle->ask, cooldown->ask, ask
    // timeout->fail), collected so the DEV "suspend questions" toggle can
    // pause/resume the whole dialogue loop without freezing the hand.
    // Populated by the dialogue states; reset each level in init().
    dialogueTimers: Phaser.Time.TimerEvent[];

    scales: Phaser.GameObjects.Image[];
    demons: Phaser.GameObjects.Image[];
    skels: Phaser.GameObjects.Image[];
    currentSus: number;
    // Look-at-table reaction visual: the demon leaning over the table
    // (placeholder composite, tools/art/compose_look_over.sh). Hidden
    // except while LookAtTableState runs.
    lookOverSprite: Phaser.GameObjects.Image;
    // Reaction-window indicator: red draining bar + "hide!" caption,
    // created/destroyed alongside the look-over sprite.
    lookBar?: Phaser.GameObjects.Rectangle;
    lookCaption?: Phaser.GameObjects.Text;

    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    handVis: Phaser.GameObjects.Graphics;
    // FSM-state name of the last direction the hand moved in (set by each
    // direction state's enter handler). Read on timer expiry by
    // StunnedState (bounce = OPPOSITE of it) and HiddenState (resume =
    // same direction). Initialized in init() to match the level-start
    // direction.
    lastDirection: HandStateName;

    // Stash spots — one record per hole on the table. `armed` is the
    // edge-trigger for the hide: cleared when a hide fires, restored by
    // update() once the hand has fully left the zone. Built in create()
    // from LEVELS[CURRENT_LEVEL_INDEX].stashSpots.
    stashSpots: { zone: Phaser.GameObjects.Zone; armed: boolean }[];

    lootSprites: Array<string>;
    // The live loot sprite (only ever 0 or 1 on the table). Tracked so the
    // DEV "suspend loot" toggle can clear it from the table.
    currentLoot?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
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
    // DEV-only playtest controls (wired only under import.meta.env.DEV, so
    // Vite strips all of this from production). Three toggles: suspend the
    // dialogue/question loop, suspend loot spawning, and hold the
    // look-over reaction sprite on screen for layout inspection without
    // the 2s reaction-window clock. See the dev block in create() and
    // the devToggle* methods.
    devSuspendDialogue: boolean;
    devSuspendLoot: boolean;
    devLookOverHeld: boolean;
    devKeyQuestions?: Phaser.Input.Keyboard.Key;
    devKeyLoot?: Phaser.Input.Keyboard.Key;
    devKeyLookOver?: Phaser.Input.Keyboard.Key;
    devReadout?: Phaser.GameObjects.Text;
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

            if (this.isInsideStashKeepout(x, y)) {
                log.loot(`attempt ${attempt+1}: (${x.toFixed(0)}, ${y.toFixed(0)}) inside stash keep-out, resampling`);
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

    // Stash keep-out mirrors the hand keep-out inflation: forbid loot
    // centers within (zone_half + loot_size) of a stash center, so loot
    // can't sit over a hole — visually unreadable, and collecting it would
    // force a hide through the trigger zone.
    private isInsideStashKeepout(x: number, y: number): boolean {
        return this.stashSpots.some(({ zone }) => {
            const halfW = zone.width / 2 + LOOT_SIZE.width;
            const halfH = zone.height / 2 + LOOT_SIZE.height;
            return (
                x > zone.x - halfW && x < zone.x + halfW &&
                y > zone.y - halfH && y < zone.y + halfH
            );
        });
    }

    private spawnLoot() {
        // DEV: a respawn delayedCall scheduled before "suspend loot" was
        // toggled on can still fire — drop it here so the table stays clear.
        if (import.meta.env.DEV && this.devSuspendLoot) {
            return;
        }
        const lootPos: Pos = this.getLootRandomPos();
        log.loot(`SPAWNING loot at (${lootPos.x}, ${lootPos.y})`)
        const lootPic = this.lootSprites[Math.floor(Math.random()*4)];
        const loot = this.physics.add.sprite(lootPos.x, lootPos.y, lootPic);
        this.currentLoot = loot;
        this.physics.add.collider(loot, this.hand, () => {
            // No pickup while hidden — the hand is "in the hole". If a hide
            // froze the hand with its body touching this loot, collect on
            // pop-out (bodies still overlap then) instead of invisibly.
            if (this.handFSM.is('hidden')) return;
            loot.destroy();
            this.currentLoot = undefined;
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

    // Spawn the "hand is stunned" visual indicator at (x, y) — typically
    // the hand's center while it's frozen mid-stun. Two elements stacked
    // vertically around the hand, both rendered at depth 2 (HUD layer, on
    // top of the hand sprite — fully visible):
    //   - 💫 emoji ABOVE the hand (y - 60) — scale-pulses for liveness
    //   - shrinking red bar BELOW the hand (y + 60) — drains over
    //     `durationMs` so the player can see how much stun is left
    //
    // Caller gets a `{ destroy }` handle — single call cleans up both
    // objects (StunnedState.exit). Cheaper than Phaser.GameObjects.Container
    // since we don't need group-level transforms.
    //
    // Tuning knobs:
    //   - emoji size: '36px'; emoji y-offset: -60 (above the hand)
    //   - bar y-offset: +60 (below the hand)
    //   - bar size: 54 wide × 9 tall
    //   - bar color: 0xaa44ff (vivid violet). Intentionally NOT red — the
    //     danger-zone underlays (top + bottom walls) are red, and that's
    //     where stunning happens, so a red timer bar would conflate with
    //     the danger signal. Purple keeps "stun timer" distinct from
    //     "danger zone" in the player's visual vocabulary.
    showStunIndicator(x: number, y: number, durationMs: number): { destroy: () => void } {
        // Clamp the indicator y-coords so neither element lands inside the
        // red wall danger zones — those are exactly the places stuns happen
        // (top wall spans y≈-49..57, bottom wall y≈543..657 with jaggedness).
        // EMOJI_MIN_Y keeps the emoji's center 9px below the top wall's
        // lower edge so the emoji visually clears the red. BAR_MAX_Y keeps
        // the bar 3px above the bottom wall's upper edge. When the hand is
        // close enough to a wall that the standard ±60 offset would land
        // inside the danger zone, the indicator stacks tighter on the
        // safe side instead of overlapping the wall.
        const EMOJI_MIN_Y = 66;
        const BAR_MAX_Y = 540;
        const emojiY = Math.max(y - 60, EMOJI_MIN_Y);
        const barY = Math.min(y + 60, BAR_MAX_Y);

        // Bar BELOW the hand. Depth 2 puts it on top of the hand sprite so
        // it stays visible regardless of hand orientation/size.
        const bar = this.add.rectangle(x, barY, 54, 9, 0xaa44ff).setOrigin(0.5).setDepth(2);

        // Emoji ABOVE the hand. Same depth as the bar. No fontFamily — emojis
        // render via the platform emoji font regardless of fontFamily, so
        // declaring it would be dead-letter (and misleading: it'd suggest
        // the emoji is in the project's Architects Daughter display font).
        const emoji = this.add.text(x, emojiY, '💫', {
            fontSize: '36px',
        }).setOrigin(0.5).setDepth(2);

        // Bar drains over the stun duration. scaleX 1 → 0 shrinks from the
        // center outward (origin (0.5, 0.5) above). Linear ease — perceived
        // "time remaining" should feel uniform.
        this.tweens.add({
            targets: bar,
            scaleX: 0,
            duration: durationMs,
            ease: 'Linear',
        });

        // Emoji scale-pulse for a touch of life. yoyo + repeat=-1 loops
        // infinitely; the destroy() handle cleans it up by killing the
        // target object.
        this.tweens.add({
            targets: emoji,
            scale: 1.15,
            duration: 250,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        return {
            destroy: () => {
                bar.destroy();
                emoji.destroy();
            },
        };
    }

    // Spawn a transient cell-shaped sprite at the indexed loot-meter slot and
    // animate it being knocked off the meter. Called by StunnedState after a
    // stun-triggered decrement so the player gets a visible "loot knocked
    // out" cue instead of just a silent cell-state flip. Index is the
    // post-decrement loot count — equal to the index of the cell that just
    // became empty.
    //
    // Motion shape (crispy two-phase + delayed fade):
    //   t=0    spawn at cell pos, opaque
    //   t=100  apex of small upward jump (~15px) — easeOut, decelerating
    //   t=350  bottom of fall (~100px below cell, ~35° tumble) — Cubic easeIn
    //   t=250  alpha fade BEGINS (so movement dominates early frames)
    //   t=450  alpha = 0 → destroy
    //
    // Tuning knobs: jump apex (-15 / duration 100), fall distance (+100),
    // fall duration (250), tumble angle (35°), fade delay (250), fade
    // duration (200).
    knockOutLootCell(index: number): void {
        if (index < 0 || index >= this.lootMeterCells.length) return;
        const cell = this.lootMeterCells[index];
        const copy = this.add.rectangle(
            cell.x, cell.y,
            LOOT_METER_CELL_WIDTH, LOOT_METER_CELL_HEIGHT,
            LOOT_METER_FILL_COLOR,
        ).setOrigin(0).setStrokeStyle(2, LOOT_METER_STROKE_COLOR);
        // Phase 1 → 2: small jump up, then accelerating fall with tumble.
        this.tweens.chain({
            targets: copy,
            tweens: [
                { y: cell.y - 15, duration: 100, ease: 'Quad.easeOut' },
                { y: cell.y + 100, angle: 35, duration: 250, ease: 'Cubic.easeIn' },
            ],
        });
        // Alpha fade runs in parallel but starts late so the early movement
        // reads clearly. Destroy fires when the fade completes (this tween
        // outlasts the movement chain by ~100ms).
        this.tweens.add({
            targets: copy,
            alpha: 0,
            delay: 250,
            duration: 200,
            onComplete: () => copy.destroy(),
        });
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

        this.askingStagingTimers = [];
        this.askingStagingTimers.push(this.time.delayedCall(0, () => {
            this.bubbleEnemy.setAlpha(1);
        }))
        this.askingStagingTimers.push(this.time.delayedCall(300, () => {
            const questionImage = this.add.image((GAME_WIDTH - 200), 430, question);
            questionImage.setDepth(1);
            this.emojisImages.add(questionImage);
        }))
        this.askingStagingTimers.push(this.time.delayedCall(600, () => {
            this.bubblePlayer.setAlpha(1);
        }))

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
            this.askingStagingTimers.push(this.time.delayedCall(delay, () => {
                this.answerConstructor(answerPositions[i], this.answerKeysLetters[i], answers[i]);
                if (i === answers.length - 1) {
                    // Last answer rendered: now bind keys and signal ready.
                    // Player physically cannot press an answer key before this
                    // point, so the answer-eligibility window starts here.
                    this.bindAnswerKeys(rightLetter);
                    onReady();
                }
            }));
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

    // Advance suspicion by one. Returns true when the ALARM fired (sus
    // reached 4) — the caller's dialogue flow has been hijacked (the
    // dialogue FSM is now in a reaction state) and it must stop without
    // transitioning anywhere itself. Reaching full sus is NOT a game-over
    // anymore (DESDOC "Палево"): the reaction's check decides the run.
    // The alarm trigger deliberately lives HERE, not in a setSusLevel-like
    // setter — settle paths that re-apply level visuals must never re-roll
    // the alarm (the design's one-way-ratchet placement).
    progressSus(): boolean
    {
        // Already mid-reaction (a wall stun during the look window lands
        // here): sus is pegged at full — re-triggering would re-enter the
        // reaction state and RESTART its window (the FSM has no same-state
        // guard), gifting the player extra reaction time per crash.
        if (this.dialogueFSM.is('lookAtTable')) {
            return true;
        }

        this.currentSus += 1;
        log.sus(`progressSus: currentSus = ${this.currentSus}`)

        if (this.currentSus >= 4) {
            // Stage-3 visuals stay lit and music4 keeps playing — the
            // reaction state owns the screen from here until settle (or
            // endLevel on a failed check). Storm joins with its art pass;
            // until then every alarm is a look-at-table.
            log.sus(`ALARM -> lookAtTable`);
            this.dialogueFSM.transition('lookAtTable');
            return true;
        }

        this.applySusStage(this.currentSus);

        // Sus-coupled music progression: every suspicion level has its
        // track (SUS_LEVELS); switches are tact-aligned and seek-carrying.
        // Music escalates with sus and settles only via settleAlarm().
        this.music.smoothSwitch(SUS_LEVELS[this.currentSus].music, MUSIC_HALF_TACT_SECONDS);
        log.music(`sus ${this.currentSus} -> ${SUS_LEVELS[this.currentSus].music}`);
        return false;
    }

    // Light exactly one stage of the three sus-coupled sprite stacks.
    private applySusStage(level: number): void {
        this.scales.forEach((s, i) => s.setAlpha(i === level ? 1 : 0));
        this.demons.forEach((d, i) => d.setAlpha(i === level ? 1 : 0));
        this.skels.forEach((s, i) => s.setAlpha(i === level ? 1 : 0));
    }

    // LookAtTableState visuals: the demon leaves his seat (stage sprite
    // off) and leans over the table, with a red draining bar + "hide!"
    // caption under it. durationMs drives the bar drain; omit it (the DEV
    // look-over hold) to get a static full bar for layout study.
    showLookOver(durationMs?: number): void {
        this.demons.forEach(d => d.setAlpha(0));
        this.lookOverSprite.setVisible(true);

        this.lookBar = this.add
            .rectangle(LOOK_BAR_POS.x, LOOK_BAR_POS.y, LOOK_BAR_WIDTH, LOOK_BAR_HEIGHT, LOOK_BAR_COLOR)
            .setOrigin(0.5)
            .setDepth(3);
        this.lookCaption = this.add
            .text(LOOK_CAPTION_POS.x, LOOK_CAPTION_POS.y, LOOK_CAPTION_TEXT, {
                fontFamily: 'Architects Daughter',
                fontSize: '40px',
                color: '#ff2200',
                stroke: '#000000',
                strokeThickness: 5,
            })
            .setOrigin(0.5)
            .setDepth(3);

        if (durationMs !== undefined) {
            // Drain like the stun bar: scaleX 1->0 from center, linear so
            // "time remaining" reads uniformly.
            this.tweens.add({
                targets: this.lookBar,
                scaleX: 0,
                duration: durationMs,
                ease: 'Linear',
            });
        }
    }

    hideLookOver(): void {
        this.lookOverSprite.setVisible(false);
        this.lookBar?.destroy();
        this.lookBar = undefined;
        this.lookCaption?.destroy();
        this.lookCaption = undefined;
        // Restore the demon stage sprite for the current sus. Redundant on
        // the real survive path (settleAlarm already repainted) but it is
        // what brings the demon back for the DEV look-over-hold toggle,
        // which has no settle.
        this.applySusStage(this.currentSus);
    }

    // ── DEV playtest toggles ────────────────────────────────────────────
    // Wired only under import.meta.env.DEV (create()); these methods are
    // dead code in production builds.

    // Suspend / resume the dialogue (question) loop: pause every dialogue
    // advance timer (idle/cooldown/ask-timeout + the asking-staging
    // reveal) and gate step() in update(). The hand and loot keep running.
    private devToggleDialogue(): void {
        this.devSuspendDialogue = !this.devSuspendDialogue;
        const paused = this.devSuspendDialogue;
        for (const t of this.dialogueTimers) t.paused = paused;
        for (const t of this.askingStagingTimers ?? []) t.paused = paused;
        log.dialogue(`DEV questions ${paused ? 'SUSPENDED' : 'resumed'}`);
        this.devRefreshReadout();
    }

    // Suspend / resume loot: on suspend, clear the live piece and close the
    // respawn gate (update() + spawnLoot both check the flag); on resume,
    // reopen the gate so update() respawns next frame.
    private devToggleLoot(): void {
        this.devSuspendLoot = !this.devSuspendLoot;
        if (this.devSuspendLoot) {
            this.currentLoot?.destroy();
            this.currentLoot = undefined;
        } else {
            this.lootAmount = 0; // reopen the respawn gate
        }
        log.loot(`DEV loot ${this.devSuspendLoot ? 'SUSPENDED' : 'resumed'}`);
        this.devRefreshReadout();
    }

    // Hold / release the look-over reaction sprite for static layout study.
    // Holding it suspends questions + loot, freezes the level timer (so the
    // 60s clock can't fire GameOver mid-inspection), and clears the
    // dialogue UI so the frame is quiet; releasing reverses all four. The
    // hand stays drivable (physics isn't on the timer clock) for layering
    // checks.
    private devToggleLookOver(): void {
        this.devLookOverHeld = !this.devLookOverHeld;
        if (this.devLookOverHeld) {
            if (!this.devSuspendDialogue) this.devToggleDialogue();
            if (!this.devSuspendLoot) this.devToggleLoot();
            this.levelTimer.paused = true;
            this.hideAskingUI();
            this.showLookOver();
        } else {
            this.hideLookOver();
            this.levelTimer.paused = false;
            if (this.devSuspendDialogue) this.devToggleDialogue();
            if (this.devSuspendLoot) this.devToggleLoot();
        }
        log.dialogue(`DEV look-over ${this.devLookOverHeld ? 'HELD' : 'released'}`);
        this.devRefreshReadout();
    }

    private devRefreshReadout(): void {
        this.devReadout?.setText(
            `DEV  [1] questions ${this.devSuspendDialogue ? 'SUSPENDED' : 'live'}   ` +
            `[2] loot ${this.devSuspendLoot ? 'SUSPENDED' : 'live'}   ` +
            `[3] look-over ${this.devLookOverHeld ? 'HELD' : 'off'}`,
        );
    }

    // Post-alarm settle: the WHOLE sus-coupled bundle drops together to
    // the baseline (counter, all three sprite stacks, music). Music is a
    // single hard cut to the baseline track — the big-release moment —
    // not a tact-aligned smooth switch.
    settleAlarm(): void {
        this.currentSus = SUS_BASELINE;
        this.applySusStage(SUS_BASELINE);
        this.music.play(SUS_LEVELS[SUS_BASELINE].music);
        log.sus(`alarm settled: sus = ${SUS_BASELINE}`);
    }

    hideAskingUI() {
        log.dialogue(`hideAskingUI fired at ${this.time.now}`)
        // Cancel any still-pending staged-reveal callbacks (see the
        // askingStagingTimers field comment) — idempotent, remove() is
        // safe on already-fired timers.
        this.askingStagingTimers?.forEach(t => t.remove());
        this.askingStagingTimers = [];
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

        this.dialogueTimers = [];
        this.devSuspendDialogue = false;
        this.devSuspendLoot = false;
        this.devLookOverHeld = false;

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
                lookAtTable: new LookAtTableState(),
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
                hidden:  new HiddenState(),
            },
            [this],
        );
    }

    create ()
    {
        this.input.setDefaultCursor(MENU_CURSOR);

        log.music(`registering music tracks`)
        this.music = new MusicController(this);
        for (const level of SUS_LEVELS) {
            this.music.register(level.music, { loop: true });
        }
        this.music.play(SUS_LEVELS[0].music);

        // Cleanup on scene stop. Phaser does NOT auto-call a `shutdown()`
        // method on Scene subclasses — cleanup must subscribe to the
        // SHUTDOWN event (once(): create() re-subscribes on every scene
        // (re)start). The SoundManager is game-scoped, so without this the
        // Pause → LEAVE path (scene.stop without endLevel) left the
        // gameplay track playing over MainMenu.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.music.stopAll());

        this.cameras.main.setBackgroundColor(0xff00ff);

        this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'table');

        // DIALOGUE

        this.bubbleEnemy = this.add.image((GAME_WIDTH - 200), 400, 'bubble-demon');
        this.bubbleEnemy.setAlpha(0);
        this.bubbleEnemy.setDepth(1);
        this.bubblePlayer = this.add.image(200, 400, 'bubble-skel');
        this.bubblePlayer.setAlpha(0);
        this.bubblePlayer.setDepth(1);

        this.emojis = ['drum', 'casino', 'movie-tape', 'cat', 'dice', 'money-bag', 'mice', 'meet', 'tennis', 'note', 'jew', 'palette', 'cook', 'ghost', 'ball', 'skull'];
        this.qAndA = {
            'casinoDemon': 'dice',
            'catDemon': 'mice',
            'money-bagDemon': 'jew',
            'noteDemon': 'drum',
            'paletteDemon': 'movie-tape',
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

        // Look-at-table warning visual — the demon leaning over the table
        // from his seat side. look-over.png is 749x795 native; scaled and
        // positioned so the lean covers the arcade area's right half
        // without covering the suspicion meter (top-right HUD) — verified
        // by e2e screenshot. Depth above table/hand/loot, below HUD (2).
        this.lookOverSprite = this.add.image(1100, 200, 'look-over')
            .setScale(0.75)
            .setDepth(2)
            .setVisible(false);

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

        // STASH spots — cracked-hole tiles the hand auto-hides in (DESDOC
        // "нычка"). Image renders under the hand via display-list order
        // (created before it). The physics zone covers only the solid hole
        // INTERIOR (STASH_TRIGGER_SIZE), not the full crack span. hole.png
        // is 120x120 native.
        this.stashSpots = LEVELS[CURRENT_LEVEL_INDEX].stashSpots.map((pos) => {
            this.add.image(pos.x, pos.y, 'hole');
            const zone = this.add.zone(pos.x, pos.y, STASH_TRIGGER_SIZE.width, STASH_TRIGGER_SIZE.height);
            this.physics.add.existing(zone, true);
            return { zone, armed: true };
        });

        // 106x67
        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 50, 'hand');
        this.handVis = this.add.graphics();

        // The FSM is constructed in init() and first-stepped by update() on
        // the next frame — at which point this.cursors (initialized later in
        // create()) is available for LeftState.execute()'s input poll.
        // Calling handFSM.step() here would fire enter()+execute() in one
        // call, and execute() needs cursors. One frame of zero-velocity hand
        // between create() and the first update() is negligible.

        // Collision → stun (replaces the previous instant-death). Two
        // guards: `ended` so endLevel-fired-but-not-yet-paused doesn't
        // re-trigger; `is('stunned')` so Phaser's per-frame collider
        // re-fire while bodies still overlap during the 1s freeze doesn't
        // chain into a re-stun.
        this.physics.add.collider(this.hand, blocks, () => {
            if (this.ended) return;
            if (this.handFSM.is('stunned')) return;
            // Hidden ⊥ Stunned (TODOS pre-thinking: mutually exclusive).
            // Defensive — a hidden hand has zero velocity mid-table and
            // shouldn't reach a wall, but the guard makes it a non-issue.
            if (this.handFSM.is('hidden')) return;
            this.handFSM.transition('stunned');
        });

        // Touch → hide (overlap, not collider — the hole doesn't block
        // movement; the hand sinks in). Guards mirror the stun collider's.
        // `armed` is the edge-trigger: cleared here, restored by update()
        // once the hand has fully left the zone — the "auto-step-out"
        // resolution of the TODOS re-trigger question, so popping out while
        // still over the hole can't chain into an immediate re-hide.
        for (const spot of this.stashSpots) {
            this.physics.add.overlap(this.hand, spot.zone, () => {
                if (this.ended || !spot.armed) return;
                if (this.handFSM.is('stunned') || this.handFSM.is('hidden')) return;
                spot.armed = false;
                // Disarm every OTHER zone the hand currently touches too:
                // on pop-out it is still touching them, and an armed
                // adjacent zone would chain straight into a re-hide.
                // No-op today (one spot); matters once levels have 2+.
                for (const other of this.stashSpots) {
                    if (other !== spot && this.physics.overlap(this.hand, other.zone)) {
                        other.armed = false;
                    }
                }
                log.hand(`stash hide at (${spot.zone.x}, ${spot.zone.y})`);
                this.handFSM.transition('hidden');
            });
        }

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

        // DEV playtest controls. Vite statically drops this whole block from
        // production builds, so the toggle keys + readout exist only in
        // `bun run dev`. Keys 1/2/3 toggle question-suspend, loot-suspend,
        // and look-over-hold (the last is the layout-inspection macro). The
        // readout (bottom-left) shows live toggle state since in-game timings
        // are too fast to eyeball.
        if (import.meta.env.DEV && this.input.keyboard) {
            const kb = this.input.keyboard;
            this.devKeyQuestions = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
            this.devKeyLoot = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
            this.devKeyLookOver = kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
            this.devReadout = this.add.text(10, GAME_HEIGHT - 30, '', {
                fontFamily: 'monospace',
                fontSize: '16px',
                color: '#00ff66',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
            }).setDepth(100);
            this.devRefreshReadout();
        }
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

    // "Is the hand safely stashed right now?" — the predicate the deferred
    // alarm-reactions look-at-table check consumes (per the retired dep
    // scope map). Named for intent so the future glance code doesn't read
    // as FSM plumbing.
    handIsStashed(): boolean {
        return this.handFSM.is('hidden');
    }

    private pauseGame()
    {
        this.scene.pause();
        this.scene.launch('Pause');
    }

    // Single exit point for "the level has ended" transitions — either via
    // a loss path (caught by the look-at-table check, timer expiry) or the
    // win path (loot target hit). Pause the scene, stop all music
    // (scene.pause alone doesn't stop sound because the SoundManager is
    // game-scoped, not scene-scoped — handled here via this.music.stopAll),
    // then launch the appropriate overlay.
    //
    // Public: LookAtTableState's failed check calls it (the design's R5 —
    // the second game-over callsite arrived, and exposing the single exit
    // point beats extracting a wrapper).
    //
    // pauseGame (the player-triggered ESC pause) intentionally does NOT route
    // through here — it preserves music for continuity when the player
    // resumes mid-game.
    endLevel(target: 'GameOver' | 'Win'): void {
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

        // DEV playtest toggles (stripped from production by the env gate).
        if (import.meta.env.DEV) {
            if (this.devKeyQuestions && Phaser.Input.Keyboard.JustDown(this.devKeyQuestions)) this.devToggleDialogue();
            if (this.devKeyLoot && Phaser.Input.Keyboard.JustDown(this.devKeyLoot)) this.devToggleLoot();
            if (this.devKeyLookOver && Phaser.Input.Keyboard.JustDown(this.devKeyLookOver)) this.devToggleLookOver();
        }

        // DEV "suspend questions" freezes the dialogue loop (its advance
        // timers are paused in devToggleDialogue; gating step() here also
        // stops AskingState's keypress poll). The hand FSM keeps running.
        if (!(import.meta.env.DEV && this.devSuspendDialogue)) {
            this.dialogueFSM.step();
        }
        // Purely defensive re-check: since the alarm pass, no synchronous
        // path inside dialogueFSM.step() reaches endLevel anymore (sus 4
        // fires the alarm; the look check's endLevel runs from the clock
        // pass before update()). Kept because it is cheap and a future
        // dialogue state may reintroduce a same-frame end path.
        if (this.ended) {
            return;
        }
        this.handFSM.step();

        // Re-arm stash zones once the hand has fully left them (see the
        // overlap wiring in create). Cheap: 1-3 AABB checks per frame.
        for (const spot of this.stashSpots) {
            if (!spot.armed && !this.physics.overlap(this.hand, spot.zone)) {
                spot.armed = true;
                log.hand(`stash re-armed at (${spot.zone.x}, ${spot.zone.y})`);
            }
        }

        // Refresh the timer countdown. getRemainingSeconds() returns the live
        // remaining time from Phaser's pause-aware clock; formatTime ceil's
        // it so the displayed "1:00" stays visible for the full first second
        // (rather than flicking to "0:59" at elapsed=0.001s).
        this.timerText.setText(this.formatTime(this.levelTimer.getRemainingSeconds()));

        // Create LOOT (DEV "suspend loot" closes the respawn gate).
        if (!(import.meta.env.DEV && this.devSuspendLoot) && this.lootAmount === 0) {
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

}
