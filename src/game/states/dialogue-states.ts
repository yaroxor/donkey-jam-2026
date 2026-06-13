// Dialogue FSM states for MainGame's heist loop.
//
// Extracted from MainGame.ts so tests can instantiate these classes without
// pulling in Phaser at module load. MainGame.ts itself `extends Scene` which
// triggers Phaser's device-detection code (navigator, window, ...) to run at
// import time -- fine in a browser, fatal in a Node-environment test.
//
// The trick: this file imports MainGame as a TYPE-ONLY symbol. The `import
// type` syntax is erased at compile time, so at runtime there's no module
// cycle and no Phaser load. The state classes still typecheck against the
// real MainGame shape because TS reads the type signature without emitting
// a runtime reference.

import { State } from '../../lib/StateMachine.ts';
import { loadSettings, effectiveVolume } from '../settings.ts';
import type { MainGame } from '../scenes/MainGame.ts';

export type DialogueStateName = 'idle' | 'asking' | 'cooldown' | 'lookAtTable' | 'storm';
export type DialogueArgs = [MainGame];

// Question-storm duration (DESDOC "загрузить вопросами"). Bubbles bury the
// arcade for this long -- no check, no fail, just lost time + blocked
// visibility (the hand keeps moving; you navigate from memory). Tunable.
const STORM_DURATION_MS = 3000;

// Look-at-table reaction window: the warning visual (demon leaning over the
// table + a red draining bar and "hide!" caption) fires on state entry; the
// player has this long to get the hand into a stash before the check fires.
// Tune in playtest -- long enough that a competent player can reach a stash,
// short enough to punish carelessness. A hide DURING this window holds (its
// 1s auto-pop is suppressed, see HiddenState) so reaching the stash any time
// before the check is enough; the window is pure travel time, not a
// hide-at-exactly-the-right-moment puzzle.
const LOOK_REACTION_WINDOW_MS = 2000;

// JustDown fires once per physical press; isDown stays true every frame
// the key is held. Wrap to skip the undefined check at every call site.
function justDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
    return key !== undefined && Phaser.Input.Keyboard.JustDown(key);
}

export class IdleState extends State<DialogueStateName, DialogueArgs> {
    private timer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        this.timer = scene.time.delayedCall(2000, () => {
            this.stateMachine.transition('asking');
        });
        scene.dialogueTimers?.push(this.timer);  // DEV suspend-questions registry
    }

    // The alarm (progressSus via a wall stun) can yank the FSM out of this
    // state from outside -- without the cancel, the stale timer would later
    // fire transition('asking') INTO the running reaction state.
    exit(): void {
        this.timer?.remove();
        this.timer = undefined;
    }
}

export class AskingState extends State<DialogueStateName, DialogueArgs> {
    private timeoutTimer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        // Pass a ready-callback to showAskingUI: it fires when the last
        // answer has rendered AND keys are bound. The answer-eligibility
        // window starts from that moment, not from enter -- so changes to
        // the bubble/question/answer staging timings can't desync the
        // window length.
        scene.showAskingUI(() => {
            this.timeoutTimer = scene.time.delayedCall(3000, () => this.fail(scene));
            scene.dialogueTimers?.push(this.timeoutTimer);  // DEV suspend-questions registry
        });
    }

    execute(scene: MainGame): void {
        // Music is NOT switched here: it follows the suspicion level only
        // (progressSus owns the switch; sus never decreases in v1.0, so a
        // right answer holds the current tension rather than resetting to
        // calm -- the music-progression design's R3 call).
        if (justDown(scene.rightAnswerKey) || justDown(scene.rightAnswerKey2)) {
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
        // Wrong-answer feedback fires on EVERY fail, including the one
        // that fires the ALARM (sus 3 -> 4) -- that's exactly when "you
        // screwed up" punctuation matters most (the design's R2 call).
        // SFX first so the crack lands synchronously with the alarm's
        // warning visual.
        scene.sound.play('crack-head', { volume: effectiveVolume(loadSettings(), 'sfx') });
        // progressSus owns the sus-coupled music switch (SUS_LEVELS) and
        // the alarm trigger. True = the alarm fired and the dialogue FSM
        // is already in the reaction state -- do NOT transition over it.
        if (scene.progressSus()) {
            return;
        }
        this.stateMachine.transition('cooldown');
    }
}

export class CooldownState extends State<DialogueStateName, DialogueArgs> {
    private timer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        this.timer = scene.time.delayedCall(5000, () => {
            this.stateMachine.transition('asking');
        });
        scene.dialogueTimers?.push(this.timer);  // DEV suspend-questions registry
    }

    // Same stale-timer hazard as IdleState: a stun-triggered alarm during
    // the cooldown breather transitions away from here externally.
    exit(): void {
        this.timer?.remove();
        this.timer = undefined;
    }
}

// Look-at-table alarm reaction (DESDOC "Палево": the demon checks the
// table). Entered by progressSus() when sus hits 4 -- NOT a game-over by
// itself: the warning visual (demon leaning over the table) fires
// immediately, the player gets LOOK_REACTION_WINDOW_MS to get the hand
// stashed, then the check fires instantaneously. Stashed -> the whole
// sus-coupled bundle settles to baseline and dialogue resumes; caught ->
// the run ends. The hand keeps full physics during the window -- a wall
// stun mid-window (1s frozen) is usually fatal, by design.
export class LookAtTableState extends State<DialogueStateName, DialogueArgs> {
    private timer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        scene.showLookOver(LOOK_REACTION_WINDOW_MS);
        this.timer = scene.time.delayedCall(LOOK_REACTION_WINDOW_MS, () => {
            // Same-clock-pass guard: the level timer can expire (and
            // endLevel) in the SAME frame this window elapses -- Phaser
            // fires all elapsed timers of a pass, and a mid-pass pause
            // doesn't stop the rest. Without this, a stashed hand would
            // "survive" into a settle that restarts music over the
            // GameOver overlay (game-scoped SoundManager).
            if (scene.ended) {
                return;
            }
            if (scene.handIsStashed()) {
                scene.settleAlarm();
                // The hand held in the stash through the whole window (its
                // 1s auto-pop is suppressed during the reaction) -- release
                // it now so it resumes moving.
                scene.releaseHiddenHand();
                // Per the design: reactions end by transitioning to the
                // next question, not to a breather.
                this.stateMachine.transition('asking');
            } else {
                // Caught. No exit runs (the scene pauses) -- the leaning
                // demon stays on screen behind the GameOver overlay,
                // which reads as "caught in the act".
                scene.endLevel('GameOver');
            }
        });
    }

    exit(scene: MainGame): void {
        scene.hideLookOver();
        this.timer?.remove();
        this.timer = undefined;
    }
}

// Question-storm alarm reaction (DESDOC "загрузить вопросами"): the demon
// buries the table in question bubbles for STORM_DURATION_MS. Unlike
// look-at-table there is no check and no fail -- the hand keeps moving with
// full physics (a wall crash still stuns, blind, behind the bubbles), the
// cost is lost level-timer time and lost visibility. Always settles to
// baseline and resumes asking when the storm ends.
export class StormState extends State<DialogueStateName, DialogueArgs> {
    private timer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        scene.showStorm();
        this.timer = scene.time.delayedCall(STORM_DURATION_MS, () => {
            // Same same-clock-pass guard as look-at-table: a level-timer
            // expiry in this frame already ended the level; don't settle
            // (and restart music) over the GameOver overlay.
            if (scene.ended) {
                return;
            }
            scene.settleAlarm();
            this.stateMachine.transition('asking');
        });
    }

    exit(scene: MainGame): void {
        scene.hideStorm();
        this.timer?.remove();
        this.timer = undefined;
    }
}
