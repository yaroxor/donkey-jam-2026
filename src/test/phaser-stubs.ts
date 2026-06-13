// Phaser test stubs. Minimal stand-ins for the Phaser API surface our code
// touches -- enough to test MusicController, dialogue FSM states, and other
// Phaser-coupled modules without spinning up a real Phaser game.
//
// Pattern: each test constructs a FakeScene via `makeFakeScene()`, passes
// it to the system-under-test cast as `Scene` via `asScene()`. Tests assert
// against the vi.fn() mocks recorded on the FakeScene's surfaces.
//
// For timers, the fake captures every `delayedCall(ms, cb)` into
// `scene.time.timers` so tests can manually call `timer.fire()` to advance
// "time" -- no real wait, no scheduling, deterministic.

import { vi } from 'vitest';
import type { Scene } from 'phaser';

// ------------------------------------------------------------------------
// FakeSound -- stands in for Phaser.Sound.WebAudioSound / HTML5AudioSound
// ------------------------------------------------------------------------

export class FakeSound {
    seek = 0;
    volume = 1;
    isPlaying = false;

    // Arrow-function fields bind `this` to the instance, so vi.fn(() => ...)
    // works correctly here. Each mock both records the call AND mutates
    // the fake's state so subsequent assertions on isPlaying / seek work.
    // play/setSeek model Phaser's REAL seek semantics (BaseSound.play
    // resets the config -- bare play() restarts from 0:00, only a config
    // seek survives; setSeek on a stopped sound is a documented no-op) so
    // tests can't pin behavior Phaser doesn't have -- the old fakes did,
    // and hid a switched-track-restarts-from-zero bug for a month.
    play = vi.fn((config?: { seek?: number }): void => {
        this.isPlaying = true;
        this.seek = config && typeof config.seek === 'number' ? config.seek : 0;
    });

    stop = vi.fn((): void => {
        this.isPlaying = false;
    });

    setSeek = vi.fn((t: number): void => {
        if (this.isPlaying) {
            this.seek = t;
        }
    });

    setVolume = vi.fn((v: number): void => {
        this.volume = v;
    });

    constructor(public readonly key: string) {}
}

// ------------------------------------------------------------------------
// FakeTimerEvent -- stands in for Phaser.Time.TimerEvent
// ------------------------------------------------------------------------

export interface FakeTimerEvent {
    /** Delay in ms, as passed to delayedCall. */
    delay: number;
    /** The callback to invoke when fire() is called. */
    callback: () => void;
    /** Whether fire() or remove() has run. */
    consumed: boolean;
    /** Manually fire the callback (simulates time advancing). No-op if already consumed. */
    fire: () => void;
    /** Mock matching Phaser's TimerEvent.remove. Marks consumed so fire() becomes a no-op. */
    remove: ReturnType<typeof vi.fn>;
}

function makeTimer(delay: number, callback: () => void): FakeTimerEvent {
    const ev: FakeTimerEvent = {
        delay,
        callback,
        consumed: false,
        fire: () => {
            if (ev.consumed) return;
            ev.consumed = true;
            callback();
        },
        remove: vi.fn((): void => {
            ev.consumed = true;
        }),
    };
    return ev;
}

// ------------------------------------------------------------------------
// FakeScene -- the subset of Phaser.Scene our code touches
// ------------------------------------------------------------------------

export interface FakeScene {
    time: {
        /** Records every delayedCall in order so tests can fire(or assert delays. */
        timers: FakeTimerEvent[];
        delayedCall: ReturnType<typeof vi.fn>;
    };
    sound: {
        /** Internal store of sounds added so far, keyed by asset name. */
        sounds: Map<string, FakeSound>;
        add: ReturnType<typeof vi.fn>;
        getAll: ReturnType<typeof vi.fn>;
        /** Fire-and-forget one-shot play. Records the key + config for assertions. */
        play: ReturnType<typeof vi.fn>;
    };
}

export function makeFakeScene(): FakeScene {
    const timers: FakeTimerEvent[] = [];
    const sounds = new Map<string, FakeSound>();

    return {
        time: {
            timers,
            delayedCall: vi.fn((delay: number, cb: () => void): FakeTimerEvent => {
                const ev = makeTimer(delay, cb);
                timers.push(ev);
                return ev;
            }),
        },
        sound: {
            sounds,
            add: vi.fn((key: string, _cfg?: object): FakeSound => {
                const s = new FakeSound(key);
                sounds.set(key, s);
                return s;
            }),
            getAll: vi.fn((key: string): FakeSound[] => {
                const s = sounds.get(key);
                return s ? [s] : [];
            }),
            play: vi.fn(),
        },
    };
}

/**
 * Cast a FakeScene to Phaser.Scene for passing into production code that
 * expects the real type. The fake satisfies only the subset of Scene that
 * the SUT actually uses -- TypeScript can't verify this, so the cast is a
 * promise to the type system that's checked at runtime by the SUT itself.
 */
export function asScene(s: FakeScene): Scene {
    return s as unknown as Scene;
}
