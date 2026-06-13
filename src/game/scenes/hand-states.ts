// Hand FSM states for MainGame's arcade loop.
//
// Same extraction pattern as dialogue-states.ts: type-only import of
// MainGame so this module doesn't load Phaser at module-load time. The
// state classes still typecheck against the real MainGame shape; the
// `import type` is erased at compile and there's no runtime module cycle.
//
// State graph:
//
//   Left ⇄ Right (via Up/Down — direct L↔R reversal not allowed; must turn
//                  vertical first; matches the pre-FSM input model)
//   Up   ⇄ Down (via Left/Right — same)
//   Any direction → Stunned on hand-vs-block collision (collider callback
//                                                       in MainGame.create)
//   Stunned → OPPOSITE[lastDirection] after a 1s timer (bounce-off-wall)
//   Any direction → Hidden on stash-zone overlap (overlap callback in
//                                                 MainGame.create)
//   Hidden → lastDirection after a 1s timer (pop out, resume travel)
//
// Direction state .enter() applies setSize/angle/flipX/velocity for that
// orientation AND mirrors the current direction onto scene.lastDirection
// so Stunned (bounce = opposite) and Hidden (resume = same) can pick
// their exit targets.

import { State } from '../../lib/StateMachine.ts';
import { HAND_SPEED, HAND_LONG_DIM, HAND_SHORT_DIM, ARCADE_AREA_LAYOUT } from '../config.ts';
import { loadSettings, effectiveVolume } from '../settings.ts';
import type { MainGame } from './MainGame.ts';

export type HandStateName = 'left' | 'right' | 'up' | 'down' | 'stunned' | 'hidden';
export type HandArgs = [MainGame];

// Stun duration in ms. Used by both the StunnedState timer (controls when
// the bounce-back fires) AND the duration-bar visual indicator (controls
// how long the bar takes to drain). Single source of truth so they stay
// in lockstep — a dial of the punishment length is one number.
const STUN_DURATION_MS = 1000;

// Pre-computed wrap + vertical-safe-zone thresholds. The wrap fires when
// the hand's CENTER crosses the arcade edge (half the horizontal hand has
// stuck out). The vertical-safe-zone gates L/R → U/D turns so the
// (narrower) vertical body doesn't end up partly off-table — vertical
// motion has no wrap, so an off-table vertical hand would roam behind
// the table indefinitely.
const ARCADE_LEFT_X = ARCADE_AREA_LAYOUT.x;
const ARCADE_RIGHT_X = ARCADE_AREA_LAYOUT.x + ARCADE_AREA_LAYOUT.width;
const VERTICAL_SAFE_MIN_X = ARCADE_LEFT_X + HAND_SHORT_DIM / 2;
const VERTICAL_SAFE_MAX_X = ARCADE_RIGHT_X - HAND_SHORT_DIM / 2;

// Bounce semantics. The stun timer fires this map at the captured
// lastDirection. "Resume previous direction" would walk straight back
// into the wall that caused the stun (permastun); opposite is the only
// sane choice.
const OPPOSITE: Record<HandStateName, HandStateName> = {
    left:    'right',
    right:   'left',
    up:      'down',
    down:    'up',
    stunned: 'left',  // unreachable; type-completeness default only
    hidden:  'left',  // unreachable; type-completeness default only
};

// Apply horizontal-orientation visuals + velocity. Shared between Left and
// Right enter handlers — same body shape, same angle, sign-on-velocity
// differs, plus the flipX flag for sprite mirroring.
function applyHorizontal(scene: MainGame, going: 'left' | 'right'): void {
    scene.hand.setSize(HAND_LONG_DIM, HAND_SHORT_DIM);
    scene.redrawHandVis(HAND_LONG_DIM, HAND_SHORT_DIM);
    scene.hand.angle = 0;
    scene.hand.setFlipX(going === 'right');
    scene.hand.setVelocityY(0);
    scene.hand.setVelocityX(going === 'left' ? -HAND_SPEED : HAND_SPEED);
    scene.lastDirection = going;
}

function applyVertical(scene: MainGame, going: 'up' | 'down'): void {
    scene.hand.setSize(HAND_SHORT_DIM, HAND_LONG_DIM);
    scene.redrawHandVis(HAND_SHORT_DIM, HAND_LONG_DIM);
    scene.hand.angle = going === 'up' ? 90 : 270;
    scene.hand.setFlipX(false);
    scene.hand.setVelocityX(0);
    scene.hand.setVelocityY(going === 'up' ? -HAND_SPEED : HAND_SPEED);
    scene.lastDirection = going;
}

// Symmetric horizontal states. Wrap when center crosses arcade edge; allow
// turn to vertical only when the hand center is far enough inside the
// table that the (narrower) vertical body fits fully — see VERTICAL_SAFE
// constants above.
export class LeftState extends State<HandStateName, HandArgs> {
    enter(scene: MainGame): void {
        applyHorizontal(scene, 'left');
    }
    execute(scene: MainGame): void {
        if (scene.hand.x < ARCADE_LEFT_X) {
            scene.hand.x = ARCADE_RIGHT_X;
        }
        const safe = scene.hand.x >= VERTICAL_SAFE_MIN_X && scene.hand.x <= VERTICAL_SAFE_MAX_X;
        if (safe && scene.cursors.up.isDown) {
            this.stateMachine.transition('up');
        } else if (safe && scene.cursors.down.isDown) {
            this.stateMachine.transition('down');
        }
    }
}

export class RightState extends State<HandStateName, HandArgs> {
    enter(scene: MainGame): void {
        applyHorizontal(scene, 'right');
    }
    execute(scene: MainGame): void {
        if (scene.hand.x > ARCADE_RIGHT_X) {
            scene.hand.x = ARCADE_LEFT_X;
        }
        const safe = scene.hand.x >= VERTICAL_SAFE_MIN_X && scene.hand.x <= VERTICAL_SAFE_MAX_X;
        if (safe && scene.cursors.up.isDown) {
            this.stateMachine.transition('up');
        } else if (safe && scene.cursors.down.isDown) {
            this.stateMachine.transition('down');
        }
    }
}

// Vertical states have no wrap (vertical walls aren't pass-through) and no
// safe-zone gate on L/R transitions — horizontal hand becoming wider than
// vertical doesn't strand it because L/R then wraps normally if needed.
export class UpState extends State<HandStateName, HandArgs> {
    enter(scene: MainGame): void {
        applyVertical(scene, 'up');
    }
    execute(scene: MainGame): void {
        if (scene.cursors.left.isDown) {
            this.stateMachine.transition('left');
        } else if (scene.cursors.right.isDown) {
            this.stateMachine.transition('right');
        }
    }
}

export class DownState extends State<HandStateName, HandArgs> {
    enter(scene: MainGame): void {
        applyVertical(scene, 'down');
    }
    execute(scene: MainGame): void {
        if (scene.cursors.left.isDown) {
            this.stateMachine.transition('left');
        } else if (scene.cursors.right.isDown) {
            this.stateMachine.transition('right');
        }
    }
}

// Hide duration in ms (DESDOC "нычка": "при касании прячешься на секунду").
// Scaling per level is an open playtest question — promote to a LEVELS
// column if levels want different durations.
const HIDDEN_DURATION_MS = 1000;

// Stash hide: freeze + vanish into the hole, then resume the direction of
// travel — NOT the stun bounce. Nothing was hit; the hand sinks in and pops
// out still going the way it was going (lastDirection, which Hidden never
// writes). Triggered by the stash-zone overlap callback in MainGame.create;
// that callback also owns the re-arm rule (a zone re-arms only once the
// hand has fully LEFT it, so popping out inside the zone can't chain into
// an immediate re-hide). Cost model per DESDOC: wasted level-timer time —
// no loot decrement, no suspicion bump, deliberately unlike Stunned.
//
// Duration is conditional: 1s normally (an accidental step costs ~1s), but
// while the look-at-table reaction ("hide!") is running the hide HOLDS —
// the auto-pop is suppressed so a hand that reaches the stash stays hidden
// through the demon's check instead of popping out early and getting
// caught. LookAtTableState releases the hand (MainGame.releaseHiddenHand)
// when its check passes.
export class HiddenState extends State<HandStateName, HandArgs> {
    private timer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        scene.hand.setVelocityX(0);
        scene.hand.setVelocityY(0);
        // Vanish: the hand is "in the hole". The hole sprite stays visible;
        // hiding both the sprite and the hitbox-vis sells the sink-in.
        scene.hand.setVisible(false);
        scene.handVis.setVisible(false);

        this.timer = scene.time.delayedCall(HIDDEN_DURATION_MS, () => {
            // Hold through an active look-at-table reaction: popping out
            // mid-window would expose the hand before the check. Checked at
            // fire time (not enter) so a hide started just before the alarm
            // also holds. Released by LookAtTableState on a passed check.
            if (scene.dialogueFSM?.is('lookAtTable')) {
                return;
            }
            this.stateMachine.transition(scene.lastDirection);
        });
    }

    exit(scene: MainGame): void {
        // Idempotent, mirroring StunnedState.exit: remove() is safe after
        // fire, setVisible(true) is safe when already visible. Restoring
        // visibility here (not in the timer) covers exits that bypass the
        // timer — e.g. a future external transition.
        scene.hand.setVisible(true);
        scene.handVis.setVisible(true);
        this.timer?.remove();
        this.timer = undefined;
    }
}

// Stun penalty: freeze velocity, decrement loot (floor 0), bump suspicion
// (may fire the ALARM via progressSus — the scene keeps running either
// way), schedule a 1s bounce timer.
// The collider callback in MainGame.create guards against re-firing while
// stunned, so we don't get a per-frame re-stun from continued body overlap.
export class StunnedState extends State<HandStateName, HandArgs> {
    private timer?: Phaser.Time.TimerEvent;
    private indicator?: { destroy: () => void };

    enter(scene: MainGame): void {
        scene.hand.setVelocityX(0);
        scene.hand.setVelocityY(0);

        // Wall-hit SFX. Plays at user-tuned SFX volume; muted respects the
        // master mute. Wrong-answer pattern in dialogue-states uses the same
        // (loadSettings, effectiveVolume) read on every play to pick up
        // settings changes mid-game.
        scene.sound.play('wall-hit', { volume: effectiveVolume(loadSettings(), 'sfx') });

        if (scene.collectedLootCount > 0) {
            scene.collectedLootCount -= 1;
            scene.updateLootMeter();
            // Post-decrement count = the index of the cell that just emptied.
            // Spawn a transient copy at that slot and tween it falling off.
            scene.knockOutLootCell(scene.collectedLootCount);
        }

        // Suspicion bump. May fire the ALARM (sus reaching 4 transitions
        // the dialogue FSM into a reaction state) — but the alarm is not a
        // game-over and the scene keeps running, so the stun plays out
        // normally either way: indicator + 1s bounce. A stun that fires
        // the alarm is the classic death chain — a frozen hand can rarely
        // reach a stash before the look-at-table check — but the player
        // unfreezes with ~0.5s left and a stash-adjacent hand CAN make it.
        scene.progressSus();

        this.indicator = scene.showStunIndicator(scene.hand.x, scene.hand.y, STUN_DURATION_MS);

        this.timer = scene.time.delayedCall(STUN_DURATION_MS, () => {
            this.stateMachine.transition(OPPOSITE[scene.lastDirection]);
        });
    }

    exit(): void {
        // Idempotent: safe on double exit and safe after the timer already
        // fired (Phaser's TimerEvent.remove handles both, Container.destroy
        // is single-call-safe).
        this.timer?.remove();
        this.timer = undefined;
        this.indicator?.destroy();
        this.indicator = undefined;
    }
}
