// Dialogue FSM states for MainGame's heist loop.
//
// Extracted from MainGame.ts so tests can instantiate these classes without
// pulling in Phaser at module load. MainGame.ts itself `extends Scene` which
// triggers Phaser's device-detection code (navigator, window, ...) to run at
// import time — fine in a browser, fatal in a Node-environment test.
//
// The trick: this file imports MainGame as a TYPE-ONLY symbol. The `import
// type` syntax is erased at compile time, so at runtime there's no module
// cycle and no Phaser load. The state classes still typecheck against the
// real MainGame shape because TS reads the type signature without emitting
// a runtime reference.

import { State } from '../../lib/StateMachine.ts';
import { MUSIC_CALM, MUSIC_ALARM, MUSIC_HALF_TACT_SECONDS } from '../config.ts';
import type { MainGame } from './MainGame.ts';

export type DialogueStateName = 'idle' | 'asking' | 'cooldown';
export type DialogueArgs = [MainGame];

// JustDown fires once per physical press; isDown stays true every frame
// the key is held. Wrap to skip the undefined check at every call site.
function justDown(key: Phaser.Input.Keyboard.Key | undefined): boolean {
    return key !== undefined && Phaser.Input.Keyboard.JustDown(key);
}

export class IdleState extends State<DialogueStateName, DialogueArgs> {
    enter(scene: MainGame): void {
        scene.time.delayedCall(2000, () => {
            this.stateMachine.transition('asking');
        });
    }
}

export class AskingState extends State<DialogueStateName, DialogueArgs> {
    private timeoutTimer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        // Pass a ready-callback to showAskingUI: it fires when the last
        // answer has rendered AND keys are bound. The answer-eligibility
        // window starts from that moment, not from enter — so changes to
        // the bubble/question/answer staging timings can't desync the
        // window length.
        scene.showAskingUI(() => {
            this.timeoutTimer = scene.time.delayedCall(3000, () => this.fail(scene));
        });
    }

    execute(scene: MainGame): void {
        if (justDown(scene.rightAnswerKey) || justDown(scene.rightAnswerKey2)) {
            scene.music.smoothSwitch(MUSIC_CALM, MUSIC_HALF_TACT_SECONDS);
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
        // Wrong-answer feedback: SFX fires every fail (smoothSwitch is
        // idempotent when already on the alarm track).
        scene.sound.play('crack-head');
        scene.music.smoothSwitch(MUSIC_ALARM, MUSIC_HALF_TACT_SECONDS);
        this.stateMachine.transition('cooldown');
    }
}

export class CooldownState extends State<DialogueStateName, DialogueArgs> {
    enter(scene: MainGame): void {
        scene.time.delayedCall(5000, () => {
            this.stateMachine.transition('asking');
        });
    }
}
