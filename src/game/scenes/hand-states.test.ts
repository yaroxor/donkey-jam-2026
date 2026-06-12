import { describe, it, expect, vi } from 'vitest';
import {
    LeftState, RightState, UpState, DownState, StunnedState, HiddenState,
    type HandStateName, type HandArgs,
} from './hand-states.ts';
import { StateMachine, type State } from '../../lib/StateMachine.ts';
import type { MainGame } from './MainGame.ts';
import { makeFakeScene, type FakeScene, type FakeTimerEvent } from '../../test/phaser-stubs.ts';

// Regression contract for the hand FSM extraction (stun mechanic + bounce
// semantics + replaces the inline direction blocks in MainGame.update).
//
// Coverage targets per the plan-eng-review test diagram:
//   - Each direction state's enter() applies the right setSize/angle/flipX/
//     velocity and mirrors onto scene.lastDirection
//   - LeftState/RightState.execute() handles wrap + vertical-safe-zone gate
//   - UpState/DownState.execute() handles unconditional horizontal turn
//   - StunnedState.enter(): velocity zeroed, loot decrement floors at 0,
//     suspicion bump (the stun plays out even when it fires the alarm),
//     1s timer scheduled to OPPOSITE[lastDirection]
//   - StunnedState.exit(): timer cancellation, idempotent
//   - HiddenState (stash hide): freeze + vanish, NO stun-style penalties,
//     1s timer resumes lastDirection (same, not opposite); exit restores
//     visibility, idempotent
//
// Phaser-coupled paths (collider callback, handFSM wiring in MainGame
// update/init/create) are DEFERRED per CLAUDE.md project policy — they
// require a real-scene playthrough to verify.

// ────────────────────────────────────────────────────────────────────────
// FakeMainGame — extends FakeScene with the surfaces hand-states touches
// ────────────────────────────────────────────────────────────────────────

interface FakeCursor {
    isDown: boolean;
}

interface FakeHandBody {
    setSize: ReturnType<typeof vi.fn>;
    setVelocityX: ReturnType<typeof vi.fn>;
    setVelocityY: ReturnType<typeof vi.fn>;
    setFlipX: ReturnType<typeof vi.fn>;
    setVisible: ReturnType<typeof vi.fn>;
    x: number;
    y: number;
    angle: number;
}

interface FakeMainGame extends FakeScene {
    hand: FakeHandBody;
    handVis: { setVisible: ReturnType<typeof vi.fn> };
    cursors: { left: FakeCursor; right: FakeCursor; up: FakeCursor; down: FakeCursor };
    collectedLootCount: number;
    lastDirection: HandStateName;
    progressSus: ReturnType<typeof vi.fn>;
    updateLootMeter: ReturnType<typeof vi.fn>;
    knockOutLootCell: ReturnType<typeof vi.fn>;
    showStunIndicator: ReturnType<typeof vi.fn>;
    redrawHandVis: ReturnType<typeof vi.fn>;
}

function makeFakeMainGame(overrides: Partial<FakeMainGame> = {}): FakeMainGame {
    return {
        ...makeFakeScene(),
        hand: {
            setSize: vi.fn(),
            setVelocityX: vi.fn(),
            setVelocityY: vi.fn(),
            setFlipX: vi.fn(),
            setVisible: vi.fn(),
            x: 640,
            y: 410,
            angle: 0,
        },
        handVis: { setVisible: vi.fn() },
        cursors: {
            left:  { isDown: false },
            right: { isDown: false },
            up:    { isDown: false },
            down:  { isDown: false },
        },
        collectedLootCount: 0,
        lastDirection: 'left',
        progressSus: vi.fn().mockReturnValue(false),
        updateLootMeter: vi.fn(),
        knockOutLootCell: vi.fn(),
        showStunIndicator: vi.fn(() => ({ destroy: vi.fn() })),
        redrawHandVis: vi.fn(),
        ...overrides,
    };
}

function asMainGame(s: FakeMainGame): MainGame {
    return s as unknown as MainGame;
}

// Construct a real StateMachine wired with the state-under-test plus minimal
// stub states for every other name. The stubs let us assert the post-transition
// state via fsm.is('foo') without needing the real state classes' side effects.
function makeStubState(): State<HandStateName, HandArgs> {
    const s = Object.create(null) as State<HandStateName, HandArgs>;
    s.enter = vi.fn();
    s.execute = vi.fn();
    s.exit = vi.fn();
    return s;
}

function makeFSM(
    initial: HandStateName,
    realStates: Partial<Record<HandStateName, State<HandStateName, HandArgs>>>,
    scene: MainGame,
): StateMachine<HandStateName, HandArgs> {
    const states: Record<HandStateName, State<HandStateName, HandArgs>> = {
        left:    realStates.left    ?? makeStubState(),
        right:   realStates.right   ?? makeStubState(),
        up:      realStates.up      ?? makeStubState(),
        down:    realStates.down    ?? makeStubState(),
        stunned: realStates.stunned ?? makeStubState(),
        hidden:  realStates.hidden  ?? makeStubState(),
    };
    return new StateMachine<HandStateName, HandArgs>(initial, states, [scene]);
}

// Pre-computed boundaries that match config.ts values. Repeated here so
// tests fail loudly if the constants drift.
const ARCADE_LEFT = 385;
const ARCADE_RIGHT = 885;
const SAFE_MIN_X = 418.5;
const SAFE_MAX_X = 851.5;

// ────────────────────────────────────────────────────────────────────────
// LeftState
// ────────────────────────────────────────────────────────────────────────

describe('LeftState.enter', () => {
    it('applies horizontal size, angle 0, no flip, left velocity, and mirrors lastDirection', () => {
        const left = new LeftState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('left', { left }, asMainGame(scene));

        fsm.step(); // triggers enter on initial state

        expect(scene.hand.setSize).toHaveBeenCalledWith(106, 67);
        expect(scene.redrawHandVis).toHaveBeenCalledWith(106, 67);
        expect(scene.hand.angle).toBe(0);
        expect(scene.hand.setFlipX).toHaveBeenCalledWith(false);
        expect(scene.hand.setVelocityY).toHaveBeenCalledWith(0);
        expect(scene.hand.setVelocityX).toHaveBeenCalledWith(-300);
        expect(scene.lastDirection).toBe('left');
    });
});

describe('LeftState.execute — wrap', () => {
    it('wraps to the right arcade edge when center crosses the left edge', () => {
        const left = new LeftState();
        const scene = makeFakeMainGame({ hand: { ...makeFakeMainGame().hand, x: ARCADE_LEFT - 1 } });
        const fsm = makeFSM('left', { left }, asMainGame(scene));
        fsm.step();
        left.execute(asMainGame(scene));
        expect(scene.hand.x).toBe(ARCADE_RIGHT);
    });

    it('does not wrap when center is at or past the left edge', () => {
        const left = new LeftState();
        const scene = makeFakeMainGame({ hand: { ...makeFakeMainGame().hand, x: ARCADE_LEFT } });
        const fsm = makeFSM('left', { left }, asMainGame(scene));
        fsm.step();
        left.execute(asMainGame(scene));
        expect(scene.hand.x).toBe(ARCADE_LEFT);
    });
});

describe('LeftState.execute — vertical-turn safe-zone gate', () => {
    it('transitions to up when in safe zone and up is held', () => {
        const left = new LeftState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: 600 }, // solidly in safe zone
            cursors: { left: { isDown: false }, right: { isDown: false }, up: { isDown: true }, down: { isDown: false } },
        });
        const fsm = makeFSM('left', { left }, asMainGame(scene));
        fsm.step();
        left.execute(asMainGame(scene));
        expect(fsm.is('up')).toBe(true);
    });

    it('transitions to down when in safe zone and down is held', () => {
        const left = new LeftState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: 600 },
            cursors: { left: { isDown: false }, right: { isDown: false }, up: { isDown: false }, down: { isDown: true } },
        });
        const fsm = makeFSM('left', { left }, asMainGame(scene));
        fsm.step();
        left.execute(asMainGame(scene));
        expect(fsm.is('down')).toBe(true);
    });

    it('does NOT transition to vertical when outside safe zone (close to wrap)', () => {
        const left = new LeftState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: SAFE_MIN_X - 1 }, // just outside safe zone
            cursors: { left: { isDown: false }, right: { isDown: false }, up: { isDown: true }, down: { isDown: false } },
        });
        const fsm = makeFSM('left', { left }, asMainGame(scene));
        fsm.step();
        left.execute(asMainGame(scene));
        expect(fsm.is('left')).toBe(true); // unchanged
    });
});

// ────────────────────────────────────────────────────────────────────────
// RightState — mirror tests
// ────────────────────────────────────────────────────────────────────────

describe('RightState.enter', () => {
    it('applies horizontal size, angle 0, flip true, right velocity, mirrors lastDirection', () => {
        const right = new RightState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('right', { right }, asMainGame(scene));

        fsm.step();

        expect(scene.hand.setSize).toHaveBeenCalledWith(106, 67);
        expect(scene.hand.angle).toBe(0);
        expect(scene.hand.setFlipX).toHaveBeenCalledWith(true);
        expect(scene.hand.setVelocityX).toHaveBeenCalledWith(300);
        expect(scene.lastDirection).toBe('right');
    });
});

describe('RightState.execute — wrap', () => {
    it('wraps to the left arcade edge when center crosses the right edge', () => {
        const right = new RightState();
        const scene = makeFakeMainGame({ hand: { ...makeFakeMainGame().hand, x: ARCADE_RIGHT + 1 } });
        const fsm = makeFSM('right', { right }, asMainGame(scene));
        fsm.step();
        right.execute(asMainGame(scene));
        expect(scene.hand.x).toBe(ARCADE_LEFT);
    });
});

describe('RightState.execute — safe-zone gate', () => {
    it('does NOT transition to vertical when outside safe zone', () => {
        const right = new RightState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: SAFE_MAX_X + 1 },
            cursors: { left: { isDown: false }, right: { isDown: false }, up: { isDown: true }, down: { isDown: false } },
        });
        const fsm = makeFSM('right', { right }, asMainGame(scene));
        fsm.step();
        right.execute(asMainGame(scene));
        expect(fsm.is('right')).toBe(true);
    });

    it('transitions to up when in safe zone and up is held', () => {
        const right = new RightState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: 600 }, // solidly in safe zone
            cursors: { left: { isDown: false }, right: { isDown: false }, up: { isDown: true }, down: { isDown: false } },
        });
        const fsm = makeFSM('right', { right }, asMainGame(scene));
        fsm.step();
        right.execute(asMainGame(scene));
        expect(fsm.is('up')).toBe(true);
    });

    it('transitions to down when in safe zone and down is held', () => {
        const right = new RightState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: 600 },
            cursors: { left: { isDown: false }, right: { isDown: false }, up: { isDown: false }, down: { isDown: true } },
        });
        const fsm = makeFSM('right', { right }, asMainGame(scene));
        fsm.step();
        right.execute(asMainGame(scene));
        expect(fsm.is('down')).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────
// UpState
// ────────────────────────────────────────────────────────────────────────

describe('UpState.enter', () => {
    it('applies vertical size, angle 90, no flip, up velocity, mirrors lastDirection', () => {
        const up = new UpState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('up', { up }, asMainGame(scene));

        fsm.step();

        expect(scene.hand.setSize).toHaveBeenCalledWith(67, 106);
        expect(scene.hand.angle).toBe(90);
        expect(scene.hand.setFlipX).toHaveBeenCalledWith(false);
        expect(scene.hand.setVelocityX).toHaveBeenCalledWith(0);
        expect(scene.hand.setVelocityY).toHaveBeenCalledWith(-300);
        expect(scene.lastDirection).toBe('up');
    });
});

describe('UpState.execute — horizontal transition is unconditional', () => {
    it('transitions to left when left is held (no safe-zone gate)', () => {
        const up = new UpState();
        const scene = makeFakeMainGame({
            hand: { ...makeFakeMainGame().hand, x: SAFE_MIN_X - 5 }, // unsafe zone for L→V; allowed for V→L
            cursors: { left: { isDown: true }, right: { isDown: false }, up: { isDown: false }, down: { isDown: false } },
        });
        const fsm = makeFSM('up', { up }, asMainGame(scene));
        fsm.step();
        up.execute(asMainGame(scene));
        expect(fsm.is('left')).toBe(true);
    });

    it('transitions to right when right is held', () => {
        const up = new UpState();
        const scene = makeFakeMainGame({
            cursors: { left: { isDown: false }, right: { isDown: true }, up: { isDown: false }, down: { isDown: false } },
        });
        const fsm = makeFSM('up', { up }, asMainGame(scene));
        fsm.step();
        up.execute(asMainGame(scene));
        expect(fsm.is('right')).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────
// DownState — mirror
// ────────────────────────────────────────────────────────────────────────

describe('DownState.enter', () => {
    it('applies vertical size, angle 270, down velocity, mirrors lastDirection', () => {
        const down = new DownState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('down', { down }, asMainGame(scene));

        fsm.step();

        expect(scene.hand.setSize).toHaveBeenCalledWith(67, 106);
        expect(scene.hand.angle).toBe(270);
        expect(scene.hand.setVelocityY).toHaveBeenCalledWith(300);
        expect(scene.lastDirection).toBe('down');
    });
});

describe('DownState.execute — horizontal transition is unconditional', () => {
    it('transitions to left when left is held', () => {
        const down = new DownState();
        const scene = makeFakeMainGame({
            cursors: { left: { isDown: true }, right: { isDown: false }, up: { isDown: false }, down: { isDown: false } },
        });
        const fsm = makeFSM('down', { down }, asMainGame(scene));
        fsm.step();
        down.execute(asMainGame(scene));
        expect(fsm.is('left')).toBe(true);
    });

    it('transitions to right when right is held', () => {
        const down = new DownState();
        const scene = makeFakeMainGame({
            cursors: { left: { isDown: false }, right: { isDown: true }, up: { isDown: false }, down: { isDown: false } },
        });
        const fsm = makeFSM('down', { down }, asMainGame(scene));
        fsm.step();
        down.execute(asMainGame(scene));
        expect(fsm.is('right')).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────
// StunnedState
// ────────────────────────────────────────────────────────────────────────

describe('StunnedState.enter — velocity zeroed', () => {
    it('sets both velocity axes to 0', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));

        fsm.step();

        expect(scene.hand.setVelocityX).toHaveBeenCalledWith(0);
        expect(scene.hand.setVelocityY).toHaveBeenCalledWith(0);
    });
});

describe('StunnedState.enter — wall-hit SFX', () => {
    it('plays the wall-hit sound effect', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));

        fsm.step();

        expect(scene.sound.play).toHaveBeenCalledTimes(1);
        expect(scene.sound.play.mock.calls[0][0]).toBe('wall-hit');
    });
});

describe('StunnedState.enter — loot decrement floors at 0', () => {
    it('decrements collectedLootCount, refreshes meter, and triggers knockout animation when count > 0', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame({ collectedLootCount: 3 });
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));

        fsm.step();

        expect(scene.collectedLootCount).toBe(2);
        expect(scene.updateLootMeter).toHaveBeenCalledTimes(1);
        // Knockout fires for the cell that just emptied — index =
        // post-decrement count.
        expect(scene.knockOutLootCell).toHaveBeenCalledTimes(1);
        expect(scene.knockOutLootCell).toHaveBeenCalledWith(2);
    });

    it('does NOT decrement, refresh meter, or trigger knockout when count is already 0', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame({ collectedLootCount: 0 });
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));

        fsm.step();

        expect(scene.collectedLootCount).toBe(0);
        expect(scene.updateLootMeter).not.toHaveBeenCalled();
        expect(scene.knockOutLootCell).not.toHaveBeenCalled();
    });
});

describe('StunnedState.enter — suspicion bump', () => {
    it('schedules the 1s timer and spawns the visual indicator', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame({ progressSus: vi.fn().mockReturnValue(false) });
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));

        fsm.step();

        expect(scene.progressSus).toHaveBeenCalledTimes(1);
        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.timers[0].delay).toBe(1000);
        expect(scene.showStunIndicator).toHaveBeenCalledTimes(1);
        // Indicator spawn position = hand center; duration = stun length so
        // the bar drain matches the timer.
        expect(scene.showStunIndicator).toHaveBeenCalledWith(scene.hand.x, scene.hand.y, 1000);
    });

    it('STILL schedules the timer and indicator when progressSus fires the alarm', () => {
        // The alarm is not a game-over: the scene keeps running and the
        // stun must play out normally (the old behavior skipped both when
        // sus overflow meant an immediate endLevel — that path is gone).
        const stunned = new StunnedState();
        const scene = makeFakeMainGame({ progressSus: vi.fn().mockReturnValue(true) });
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));

        fsm.step();

        expect(scene.progressSus).toHaveBeenCalledTimes(1);
        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.showStunIndicator).toHaveBeenCalledTimes(1);
    });
});

describe('StunnedState.enter — bounce direction on timer fire', () => {
    function setupBounce(lastDirection: HandStateName): {
        scene: FakeMainGame;
        fsm: StateMachine<HandStateName, HandArgs>;
        timer: FakeTimerEvent;
    } {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame({ lastDirection });
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));
        fsm.step();
        return { scene, fsm, timer: scene.time.timers[0] };
    }

    it('left → right on bounce', () => {
        const { fsm, timer } = setupBounce('left');
        timer.fire();
        expect(fsm.is('right')).toBe(true);
    });

    it('right → left on bounce', () => {
        const { fsm, timer } = setupBounce('right');
        timer.fire();
        expect(fsm.is('left')).toBe(true);
    });

    it('up → down on bounce', () => {
        const { fsm, timer } = setupBounce('up');
        timer.fire();
        expect(fsm.is('down')).toBe(true);
    });

    it('down → up on bounce', () => {
        const { fsm, timer } = setupBounce('down');
        timer.fire();
        expect(fsm.is('up')).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────
// HiddenState (stash hide)
// ────────────────────────────────────────────────────────────────────────

describe('HiddenState.enter — freeze and vanish', () => {
    it('zeroes both velocity axes and hides the hand sprite + hitbox vis', () => {
        const hidden = new HiddenState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('hidden', { hidden }, asMainGame(scene));

        fsm.step();

        expect(scene.hand.setVelocityX).toHaveBeenCalledWith(0);
        expect(scene.hand.setVelocityY).toHaveBeenCalledWith(0);
        expect(scene.hand.setVisible).toHaveBeenCalledWith(false);
        expect(scene.handVis.setVisible).toHaveBeenCalledWith(false);
    });

    it('has no stun-style side effects: no SFX, no loot decrement, no suspicion bump', () => {
        const hidden = new HiddenState();
        const scene = makeFakeMainGame({ collectedLootCount: 3 });
        const fsm = makeFSM('hidden', { hidden }, asMainGame(scene));

        fsm.step();

        expect(scene.sound.play).not.toHaveBeenCalled();
        expect(scene.collectedLootCount).toBe(3);
        expect(scene.updateLootMeter).not.toHaveBeenCalled();
        expect(scene.progressSus).not.toHaveBeenCalled();
    });
});

describe('HiddenState — resume direction on timer fire', () => {
    function setupHide(lastDirection: HandStateName): {
        scene: FakeMainGame;
        fsm: StateMachine<HandStateName, HandArgs>;
        timer: FakeTimerEvent;
    } {
        const hidden = new HiddenState();
        const scene = makeFakeMainGame({ lastDirection });
        const fsm = makeFSM('hidden', { hidden }, asMainGame(scene));
        fsm.step();
        return { scene, fsm, timer: scene.time.timers[0] };
    }

    it('schedules a 1000ms timer', () => {
        const { scene } = setupHide('left');
        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.timers[0].delay).toBe(1000);
    });

    // Unlike the stun bounce (OPPOSITE), the hide resumes the SAME
    // direction — the hand pops out still traveling the way it was going.
    it('left resumes left (not the stun bounce)', () => {
        const { fsm, timer } = setupHide('left');
        timer.fire();
        expect(fsm.is('left')).toBe(true);
    });

    it('down resumes down', () => {
        const { fsm, timer } = setupHide('down');
        timer.fire();
        expect(fsm.is('down')).toBe(true);
    });
});

describe('HiddenState.exit', () => {
    it('restores hand + hitbox-vis visibility and cancels the timer', () => {
        const hidden = new HiddenState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('hidden', { hidden }, asMainGame(scene));
        fsm.step();
        const timer = scene.time.timers[0];

        hidden.exit(asMainGame(scene));

        expect(scene.hand.setVisible).toHaveBeenCalledWith(true);
        expect(scene.handVis.setVisible).toHaveBeenCalledWith(true);
        expect(timer.remove).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on double exit', () => {
        const hidden = new HiddenState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('hidden', { hidden }, asMainGame(scene));
        fsm.step();

        hidden.exit(asMainGame(scene));
        expect(() => hidden.exit(asMainGame(scene))).not.toThrow();
    });
});

describe('StunnedState.exit', () => {
    it('cancels the timer and destroys the indicator when both were created', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));
        fsm.step();
        const timer = scene.time.timers[0];
        const indicator = scene.showStunIndicator.mock.results[0].value as { destroy: ReturnType<typeof vi.fn> };

        stunned.exit();

        expect(timer.remove).toHaveBeenCalledTimes(1);
        expect(indicator.destroy).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on double exit', () => {
        const stunned = new StunnedState();
        const scene = makeFakeMainGame();
        const fsm = makeFSM('stunned', { stunned }, asMainGame(scene));
        fsm.step();

        stunned.exit();
        expect(() => stunned.exit()).not.toThrow();
    });
});
