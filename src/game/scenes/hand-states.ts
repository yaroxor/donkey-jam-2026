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
//
// Direction state .enter() applies setSize/angle/flipX/velocity for that
// orientation AND mirrors the current direction onto scene.lastDirection
// so Stunned can pick the bounce target.

import { State } from '../../lib/StateMachine.ts';
import { HAND_SPEED, HAND_LONG_DIM, HAND_SHORT_DIM, ARCADE_AREA_LAYOUT } from '../config.ts';
import type { MainGame } from './MainGame.ts';

export type HandStateName = 'left' | 'right' | 'up' | 'down' | 'stunned';
export type HandArgs = [MainGame];

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

// Stun penalty: freeze velocity, decrement loot (floor 0), bump suspicion
// (may overflow → endLevel via progressSus), schedule a 1s bounce timer.
// The collider callback in MainGame.create guards against re-firing while
// stunned, so we don't get a per-frame re-stun from continued body overlap.
export class StunnedState extends State<HandStateName, HandArgs> {
    private timer?: Phaser.Time.TimerEvent;

    enter(scene: MainGame): void {
        scene.hand.setVelocityX(0);
        scene.hand.setVelocityY(0);

        if (scene.collectedLootCount > 0) {
            scene.collectedLootCount -= 1;
            scene.updateLootMeter();
        }

        // progressSus increments suspicion and returns true if it overflowed
        // (sus ≥ 4) and triggered endLevel('GameOver'). In that case the
        // scene is about to pause; scheduling a timer would be wasted work
        // (Phaser pauses the per-scene clock so the callback wouldn't fire
        // anyway, but skipping makes the intent explicit).
        if (scene.progressSus()) {
            return;
        }

        this.timer = scene.time.delayedCall(1000, () => {
            this.stateMachine.transition(OPPOSITE[scene.lastDirection]);
        });
    }

    exit(): void {
        // Idempotent: safe to call when the timer was never scheduled
        // (sus-overflow short-circuit path) and safe to call after the
        // timer already fired (Phaser's TimerEvent.remove handles both).
        this.timer?.remove();
        this.timer = undefined;
    }
}
