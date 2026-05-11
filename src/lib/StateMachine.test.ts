import { describe, it, expect, vi } from 'vitest';
import { State, StateMachine } from './StateMachine.ts';

// Regression contract for the generic FSM. These tests lock the Osmose-style
// state-machine semantics that the dialogue FSM (and any future FSM) depend on:
// - first step() runs enter then execute
// - subsequent step() runs only execute
// - transition() runs old.exit BEFORE new.enter (order-sensitive)
// - transition before any step skips old.exit (currentState is null)
// - is() reflects the current state
// - stateArgs flow through to every hook

type TestStateName = 'idle' | 'active';
type TestArgs = [number];

class SpyState extends State<TestStateName, TestArgs> {
    enter = vi.fn();
    execute = vi.fn();
    exit = vi.fn();
}

function makeFsm(args: TestArgs = [42]) {
    const idle = new SpyState();
    const active = new SpyState();
    const fsm = new StateMachine<TestStateName, TestArgs>(
        'idle',
        { idle, active },
        args,
    );
    return { idle, active, fsm };
}

describe('StateMachine', () => {
    it('on first step(), enters then executes the initial state', () => {
        const { idle, fsm } = makeFsm();

        fsm.step();

        expect(idle.enter).toHaveBeenCalledTimes(1);
        expect(idle.execute).toHaveBeenCalledTimes(1);
    });

    it('on subsequent step()s, only executes (does not re-enter)', () => {
        const { idle, fsm } = makeFsm();

        fsm.step();
        fsm.step();
        fsm.step();

        expect(idle.enter).toHaveBeenCalledTimes(1);
        expect(idle.execute).toHaveBeenCalledTimes(3);
    });

    it('transition() runs old.exit and new.enter exactly once each', () => {
        const { idle, active, fsm } = makeFsm();

        fsm.step();
        fsm.transition('active');

        expect(idle.exit).toHaveBeenCalledTimes(1);
        expect(active.enter).toHaveBeenCalledTimes(1);
    });

    it('transition() runs old.exit BEFORE new.enter (order matters)', () => {
        // The dialogue FSM depends on this ordering: AskingState.exit clears
        // bubbles before CooldownState.enter (or future StormState.enter)
        // sets up its own visuals.
        const sequence: string[] = [];
        const { idle, active, fsm } = makeFsm();
        idle.exit.mockImplementation(() => sequence.push('idle.exit'));
        active.enter.mockImplementation(() => sequence.push('active.enter'));

        fsm.step();
        fsm.transition('active');

        expect(sequence).toEqual(['idle.exit', 'active.enter']);
    });

    it('transition() before any step() skips old.exit (currentState is null)', () => {
        const { idle, active, fsm } = makeFsm();

        fsm.transition('active');

        expect(idle.exit).not.toHaveBeenCalled();
        expect(active.enter).toHaveBeenCalledTimes(1);
    });

    it('is() returns false before any step(), true for current state after', () => {
        const { fsm } = makeFsm();

        expect(fsm.is('idle')).toBe(false);
        expect(fsm.is('active')).toBe(false);

        fsm.step();
        expect(fsm.is('idle')).toBe(true);
        expect(fsm.is('active')).toBe(false);

        fsm.transition('active');
        expect(fsm.is('idle')).toBe(false);
        expect(fsm.is('active')).toBe(true);
    });

    it('passes stateArgs through to enter/execute/exit', () => {
        const { idle, active, fsm } = makeFsm([99]);

        fsm.step();
        expect(idle.enter).toHaveBeenCalledWith(99);
        expect(idle.execute).toHaveBeenCalledWith(99);

        fsm.transition('active');
        expect(idle.exit).toHaveBeenCalledWith(99);
        expect(active.enter).toHaveBeenCalledWith(99);
    });

    it('after transition, step() runs only execute on the new state', () => {
        const { active, fsm } = makeFsm();

        fsm.step();
        fsm.transition('active');
        fsm.step();

        // transition() already ran active.enter once.
        // step() after transition should only fire execute, not re-enter.
        expect(active.enter).toHaveBeenCalledTimes(1);
        expect(active.execute).toHaveBeenCalledTimes(1);
    });

    it('attaches stateMachine reference to every state at construction', () => {
        // States need access to this.stateMachine in their enter/execute/exit
        // bodies (to call transition() from within a state — the dialogue
        // FSM's IdleState does this via a delayedCall).
        const { idle, active, fsm } = makeFsm();

        expect(idle.stateMachine).toBe(fsm);
        expect(active.stateMachine).toBe(fsm);
    });
});
