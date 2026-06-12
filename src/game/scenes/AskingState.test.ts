import { describe, it, expect, vi } from 'vitest';
import { AskingState } from './dialogue-states.ts';
import type { MainGame } from './MainGame.ts';
import { makeFakeScene, type FakeScene } from '../../test/phaser-stubs.ts';

// Regression contract for the showAskingUI(onReady) refactor that shipped
// in commit c287901. The refactor locked answer-key input to post-staging
// by routing the key-bind + the 3s answer-window timeout through a ready
// callback. These tests lock down that contract:
//
//   - enter() passes an onReady function to scene.showAskingUI
//   - the timeout is NOT scheduled until onReady fires
//   - invoking onReady schedules exactly one 3000ms delayedCall
//   - exit() removes the timer if it was scheduled
//   - exit() before onReady is safe (no timer, no crash)
//   - exit() always clears the dialogue UI via hideAskingUI
//
// Out of scope: AskingState.execute() (input-polling path; touches the
// runtime Phaser global) and the private fail() helper — its alarm-path
// behavior (4th wrong fires lookAtTable instead of game-over) is covered
// by the e2e alarm scenarios and dialogue-states.test.ts.
//
// Mock surface beyond phaser-stubs: scene.showAskingUI + scene.hideAskingUI
// (project-specific MainGame methods, stubbed locally below).

interface FakeMainGame extends FakeScene {
    showAskingUI: ReturnType<typeof vi.fn>;
    hideAskingUI: ReturnType<typeof vi.fn>;
}

function makeFakeMainGame(): FakeMainGame {
    return {
        ...makeFakeScene(),
        showAskingUI: vi.fn(),
        hideAskingUI: vi.fn(),
    };
}

function asMainGame(s: FakeMainGame): MainGame {
    return s as unknown as MainGame;
}

describe('AskingState — showAskingUI(onReady) callback contract', () => {
    it('enter() passes an onReady callback to scene.showAskingUI', () => {
        const asking = new AskingState();
        const scene = makeFakeMainGame();

        asking.enter(asMainGame(scene));

        expect(scene.showAskingUI).toHaveBeenCalledTimes(1);
        expect(scene.showAskingUI.mock.calls[0][0]).toBeInstanceOf(Function);
    });

    it('does NOT schedule the answer-window timeout until onReady is invoked', () => {
        const asking = new AskingState();
        const scene = makeFakeMainGame();

        asking.enter(asMainGame(scene));

        // The timeout MUST start from the ready signal, not from enter().
        // This is the structural property that lets staging delays change
        // without desyncing the answer-window length.
        expect(scene.time.delayedCall).not.toHaveBeenCalled();
    });

    it('invoking onReady schedules exactly one 3000ms timeout', () => {
        const asking = new AskingState();
        const scene = makeFakeMainGame();
        asking.enter(asMainGame(scene));
        const onReady = scene.showAskingUI.mock.calls[0][0] as () => void;

        onReady();

        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.delayedCall.mock.calls[0][0]).toBe(3000);
        expect(scene.time.delayedCall.mock.calls[0][1]).toBeInstanceOf(Function);
    });

    it('exit() removes the scheduled timeout', () => {
        const asking = new AskingState();
        const scene = makeFakeMainGame();
        asking.enter(asMainGame(scene));
        const onReady = scene.showAskingUI.mock.calls[0][0] as () => void;
        onReady();
        const timer = scene.time.timers[0];

        asking.exit(asMainGame(scene));

        expect(timer.remove).toHaveBeenCalledTimes(1);
    });

    it('exit() before onReady fires is safe (no timer to remove, no throw)', () => {
        const asking = new AskingState();
        const scene = makeFakeMainGame();
        asking.enter(asMainGame(scene));
        // Deliberately do NOT invoke onReady — the timer was never scheduled.

        expect(() => asking.exit(asMainGame(scene))).not.toThrow();
        expect(scene.time.timers).toHaveLength(0);
    });

    it('exit() always calls scene.hideAskingUI (clears bubbles, emojis, key refs)', () => {
        const asking = new AskingState();
        const scene = makeFakeMainGame();
        asking.enter(asMainGame(scene));

        asking.exit(asMainGame(scene));

        expect(scene.hideAskingUI).toHaveBeenCalledTimes(1);
    });
});
