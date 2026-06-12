import { describe, it, expect, vi } from 'vitest';
import {
    IdleState, CooldownState, LookAtTableState,
    type DialogueStateName, type DialogueArgs,
} from './dialogue-states.ts';
import { StateMachine, type State } from '../../lib/StateMachine.ts';
import type { MainGame } from './MainGame.ts';
import { makeFakeScene, type FakeScene } from '../../test/phaser-stubs.ts';

// Regression contract for the dialogue FSM's timer-owning states.
//
//   - IdleState / CooldownState: their advance timers are cancelled on
//     exit — the alarm (progressSus via a wall stun) can yank the FSM out
//     of either state from OUTSIDE, and a stale timer would later fire
//     transition('asking') INTO the running reaction state.
//   - LookAtTableState (the look-at-table alarm reaction): warning visual
//     on enter, reaction-window timer, stashed → settle + next question,
//     not stashed → endLevel('GameOver'); exit hides the visual and
//     cancels the window.
//
// AskingState's ready-callback contract lives in AskingState.test.ts;
// its execute()/fail() stay Phaser-coupled (runtime Phaser global) and
// are covered by the e2e alarm scenarios.

interface FakeDialogueScene extends FakeScene {
    showLookOver: ReturnType<typeof vi.fn>;
    hideLookOver: ReturnType<typeof vi.fn>;
    settleAlarm: ReturnType<typeof vi.fn>;
    endLevel: ReturnType<typeof vi.fn>;
    handIsStashed: ReturnType<typeof vi.fn>;
}

function makeFakeDialogueScene(overrides: Partial<FakeDialogueScene> = {}): FakeDialogueScene {
    return {
        ...makeFakeScene(),
        showLookOver: vi.fn(),
        hideLookOver: vi.fn(),
        settleAlarm: vi.fn(),
        endLevel: vi.fn(),
        handIsStashed: vi.fn().mockReturnValue(false),
        ...overrides,
    };
}

function asMainGame(s: FakeDialogueScene): MainGame {
    return s as unknown as MainGame;
}

function makeStubState(): State<DialogueStateName, DialogueArgs> {
    const s = Object.create(null) as State<DialogueStateName, DialogueArgs>;
    s.enter = vi.fn();
    s.execute = vi.fn();
    s.exit = vi.fn();
    return s;
}

function makeFSM(
    initial: DialogueStateName,
    realStates: Partial<Record<DialogueStateName, State<DialogueStateName, DialogueArgs>>>,
    scene: MainGame,
): StateMachine<DialogueStateName, DialogueArgs> {
    const states: Record<DialogueStateName, State<DialogueStateName, DialogueArgs>> = {
        idle:        realStates.idle        ?? makeStubState(),
        asking:      realStates.asking      ?? makeStubState(),
        cooldown:    realStates.cooldown    ?? makeStubState(),
        lookAtTable: realStates.lookAtTable ?? makeStubState(),
    };
    return new StateMachine<DialogueStateName, DialogueArgs>(initial, states, [scene]);
}

// ────────────────────────────────────────────────────────────────────────
// IdleState / CooldownState — advance timers die on exit
// ────────────────────────────────────────────────────────────────────────

describe('IdleState timer hygiene', () => {
    it('schedules the 2s advance to asking', () => {
        const idle = new IdleState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('idle', { idle }, asMainGame(scene));

        fsm.step();
        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.timers[0].delay).toBe(2000);

        scene.time.timers[0].fire();
        expect(fsm.is('asking')).toBe(true);
    });

    it('a stale timer cannot fire after an external transition out (alarm path)', () => {
        const idle = new IdleState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('idle', { idle }, asMainGame(scene));
        fsm.step();

        // External hijack, as progressSus does on alarm.
        fsm.transition('lookAtTable');
        scene.time.timers[0].fire(); // would have stomped the reaction

        expect(scene.time.timers[0].remove).toHaveBeenCalled();
        expect(fsm.is('lookAtTable')).toBe(true);
    });
});

describe('CooldownState timer hygiene', () => {
    it('schedules the 5s advance to asking', () => {
        const cooldown = new CooldownState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('cooldown', { cooldown }, asMainGame(scene));

        fsm.step();
        expect(scene.time.timers[0].delay).toBe(5000);

        scene.time.timers[0].fire();
        expect(fsm.is('asking')).toBe(true);
    });

    it('a stale timer cannot fire after an external transition out (alarm path)', () => {
        const cooldown = new CooldownState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('cooldown', { cooldown }, asMainGame(scene));
        fsm.step();

        fsm.transition('lookAtTable');
        scene.time.timers[0].fire();

        expect(fsm.is('lookAtTable')).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────
// LookAtTableState — the look-at-table alarm reaction
// ────────────────────────────────────────────────────────────────────────

describe('LookAtTableState.enter', () => {
    it('shows the warning visual and schedules the 1.5s reaction window', () => {
        const look = new LookAtTableState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('lookAtTable', { lookAtTable: look }, asMainGame(scene));

        fsm.step();

        expect(scene.showLookOver).toHaveBeenCalledTimes(1);
        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.timers[0].delay).toBe(1500);
        expect(scene.endLevel).not.toHaveBeenCalled();
    });
});

describe('LookAtTableState check', () => {
    it('does nothing when the level already ended in the same clock pass', () => {
        // The level timer can expire (endLevel -> ended=true) in the SAME
        // Phaser clock pass this window elapses in — the check must not
        // run a settle (music restart over the GameOver overlay) then.
        const look = new LookAtTableState();
        const scene = makeFakeDialogueScene({ handIsStashed: vi.fn().mockReturnValue(true) });
        (scene as unknown as { ended: boolean }).ended = true;
        const fsm = makeFSM('lookAtTable', { lookAtTable: look }, asMainGame(scene));
        fsm.step();

        scene.time.timers[0].fire();

        expect(scene.settleAlarm).not.toHaveBeenCalled();
        expect(scene.endLevel).not.toHaveBeenCalled();
        expect(fsm.is('lookAtTable')).toBe(true);
    });

    it('stashed hand survives: settle + next question, no game over', () => {
        const look = new LookAtTableState();
        const scene = makeFakeDialogueScene({ handIsStashed: vi.fn().mockReturnValue(true) });
        const fsm = makeFSM('lookAtTable', { lookAtTable: look }, asMainGame(scene));
        fsm.step();

        scene.time.timers[0].fire();

        expect(scene.settleAlarm).toHaveBeenCalledTimes(1);
        expect(scene.endLevel).not.toHaveBeenCalled();
        expect(fsm.is('asking')).toBe(true);
        // Exit ran via the transition: warning visual cleaned up.
        expect(scene.hideLookOver).toHaveBeenCalledTimes(1);
    });

    it('unstashed hand is caught: endLevel(GameOver), no settle, state holds', () => {
        const look = new LookAtTableState();
        const scene = makeFakeDialogueScene({ handIsStashed: vi.fn().mockReturnValue(false) });
        const fsm = makeFSM('lookAtTable', { lookAtTable: look }, asMainGame(scene));
        fsm.step();

        scene.time.timers[0].fire();

        expect(scene.endLevel).toHaveBeenCalledWith('GameOver');
        expect(scene.settleAlarm).not.toHaveBeenCalled();
        // No transition on the caught path — the scene pauses; the leaning
        // demon stays visible behind the GameOver overlay.
        expect(fsm.is('lookAtTable')).toBe(true);
        expect(scene.hideLookOver).not.toHaveBeenCalled();
    });
});

describe('LookAtTableState.exit', () => {
    it('hides the visual and cancels a pending window on early external exit', () => {
        const look = new LookAtTableState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('lookAtTable', { lookAtTable: look }, asMainGame(scene));
        fsm.step();

        fsm.transition('cooldown'); // hypothetical external exit
        scene.time.timers[0].fire(); // consumed by remove() — must be a no-op

        expect(scene.hideLookOver).toHaveBeenCalledTimes(1);
        expect(scene.time.timers[0].remove).toHaveBeenCalled();
        expect(scene.settleAlarm).not.toHaveBeenCalled();
        expect(scene.endLevel).not.toHaveBeenCalled();
    });

    it('is idempotent on double exit', () => {
        const look = new LookAtTableState();
        const scene = makeFakeDialogueScene();
        const fsm = makeFSM('lookAtTable', { lookAtTable: look }, asMainGame(scene));
        fsm.step();

        look.exit(asMainGame(scene));
        expect(() => look.exit(asMainGame(scene))).not.toThrow();
    });
});
