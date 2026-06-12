import { describe, it, expect } from 'vitest';
import { MusicController } from './MusicController.ts';
import { makeFakeScene, asScene, FakeSound } from '../test/phaser-stubs.ts';

// Regression contract for MusicController. This class is the single point of
// truth for music playback: the invariant is "at most one track plays at any
// time." Tests lock down:
//
//   - register() idempotency (both within an MC instance and against an
//     already-populated SoundManager from a prior scene)
//   - play() enforces the invariant: stops every other track before playing
//   - smoothSwitch() schedules a half-tact-aligned swap, carries playback
//     seek across the boundary (via the play() config — Phaser ignores
//     setSeek on stopped sounds), re-aligns after pause-induced drift, and
//     handles rapid re-entrancy single-flight (latest target supersedes)
//   - stopAll() / isPlaying() / unregistered-key error path
//
// Mock surface: scene.sound.add, scene.sound.getAll, scene.time.delayedCall.
// See src/test/phaser-stubs.ts for the fakes.

function setup() {
    const scene = makeFakeScene();
    const mc = new MusicController(asScene(scene));
    return { scene, mc };
}

describe('MusicController.register', () => {
    it('adds a new sound when none exists', () => {
        const { scene, mc } = setup();

        mc.register('calm');

        expect(scene.sound.add).toHaveBeenCalledTimes(1);
        expect(scene.sound.add).toHaveBeenCalledWith('calm', {});
    });

    it('is idempotent on repeated calls with the same key', () => {
        const { scene, mc } = setup();

        mc.register('calm');
        mc.register('calm');
        mc.register('calm');

        expect(scene.sound.add).toHaveBeenCalledTimes(1);
    });

    it('reuses an existing sound from the SoundManager (scene-restart idempotency)', () => {
        // Pre-populate the SoundManager as if a prior scene already created
        // this track. The SoundManager is game-scoped in production, so a
        // fresh scene's register() should NOT re-add — it should reuse.
        const { scene, mc } = setup();
        const preexisting = new FakeSound('calm');
        scene.sound.sounds.set('calm', preexisting);

        mc.register('calm');

        expect(scene.sound.add).not.toHaveBeenCalled();
        expect(scene.sound.getAll).toHaveBeenCalledWith('calm');
    });

    it('passes through the config to scene.sound.add', () => {
        const { scene, mc } = setup();

        mc.register('calm', { loop: true });

        expect(scene.sound.add).toHaveBeenCalledWith('calm', { loop: true });
    });
});

describe('MusicController.play', () => {
    it('plays the target track and sets it as current', () => {
        const { scene, mc } = setup();
        mc.register('calm');

        mc.play('calm');

        const calm = scene.sound.sounds.get('calm')!;
        expect(calm.play).toHaveBeenCalledTimes(1);
        expect(mc.isPlaying('calm')).toBe(true);
    });

    it('stops every other registered track before playing (one-track invariant)', () => {
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.register('tense');

        mc.play('alarm');

        const calm = scene.sound.sounds.get('calm')!;
        const alarm = scene.sound.sounds.get('alarm')!;
        const tense = scene.sound.sounds.get('tense')!;
        expect(calm.stop).toHaveBeenCalledTimes(1);
        expect(tense.stop).toHaveBeenCalledTimes(1);
        expect(alarm.stop).not.toHaveBeenCalled();
        expect(alarm.play).toHaveBeenCalledTimes(1);
    });

    it('throws on an unregistered key', () => {
        const { mc } = setup();

        expect(() => mc.play('does-not-exist')).toThrow(/not registered/);
    });
});

describe('MusicController.smoothSwitch', () => {
    it('is a no-op when target matches current', () => {
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');

        mc.smoothSwitch('calm', 1.5);

        expect(scene.time.delayedCall).not.toHaveBeenCalled();
    });

    it('is a no-op when nothing has been played yet (current is null)', () => {
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');

        mc.smoothSwitch('alarm', 1.5);

        expect(scene.time.delayedCall).not.toHaveBeenCalled();
    });

    it('throws on an unregistered key', () => {
        const { mc } = setup();
        mc.register('calm');
        mc.play('calm');

        expect(() => mc.smoothSwitch('nope', 1.5)).toThrow(/not registered/);
    });

    it('schedules the swap at the next half-tact boundary, carrying seek across', () => {
        // fromTrack at seek=0.5 (mid half-tact of 1.5s) → swap should fire
        // (1.5 - 0.5) * 1000 = 1000ms later.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');
        const calm = scene.sound.sounds.get('calm')!;
        calm.seek = 0.5;

        mc.smoothSwitch('alarm', 1.5);

        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.delayedCall.mock.calls[0][0]).toBe(1000);
    });

    it('on timer fire: stops other tracks and plays the target with the carried seek', () => {
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.register('tense');
        mc.play('calm');
        const calm = scene.sound.sounds.get('calm')!;
        const alarm = scene.sound.sounds.get('alarm')!;
        const tense = scene.sound.sounds.get('tense')!;
        calm.seek = 0.75;
        // Reset the stop-count from the play('calm') side effect on tense/alarm.
        alarm.stop.mockClear();
        tense.stop.mockClear();

        mc.smoothSwitch('alarm', 1.5);
        // The fake's seek doesn't advance with fake time: move it to the
        // boundary the timer was scheduled for (0.75 + 0.75s elapsed),
        // as real playback would, so the on-boundary check passes.
        calm.seek = 1.5;
        const timer = scene.time.timers[0];
        timer.fire();

        // calm was the "from" track — it gets stopped at fire time too (the
        // closure loops every registered track except `toKey`).
        expect(calm.stop).toHaveBeenCalledTimes(1);
        expect(tense.stop).toHaveBeenCalledTimes(1);
        // The seek MUST ride the play() config: real Phaser ignores setSeek
        // on a stopped sound and bare play() resets seek to 0. The fakes
        // model that, so a regression to setSeek-then-play fails here.
        expect(alarm.play).toHaveBeenCalledTimes(1);
        expect(alarm.play).toHaveBeenCalledWith({ seek: 1.5 });
        expect(alarm.seek).toBe(1.5);
        expect(alarm.isPlaying).toBe(true);
    });

    it('rapid same-target re-entrancy is a no-op after the first call', () => {
        // The optimistic `this.current = toKey` set BEFORE the timer fires
        // means a second smoothSwitch to the same target short-circuits.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');

        mc.smoothSwitch('alarm', 1.5);
        mc.smoothSwitch('alarm', 1.5);
        mc.smoothSwitch('alarm', 1.5);

        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
    });

    it('a newer different-target switch supersedes the pending one (single-flight)', () => {
        // play('calm') → smoothSwitch('alarm') → smoothSwitch('tense').
        // The second call cancels the first timer; one audible transition,
        // straight to the latest target, boundary computed from the track
        // that is actually sounding (calm) — not from the stopped alarm.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.register('tense');
        mc.play('calm');
        const calm = scene.sound.sounds.get('calm')!;
        calm.seek = 0.5;

        mc.smoothSwitch('alarm', 1.5);
        mc.smoothSwitch('tense', 1.5);

        expect(scene.time.delayedCall).toHaveBeenCalledTimes(2);
        // First timer was cancelled by the supersede.
        expect(scene.time.timers[0].remove).toHaveBeenCalled();
        // Both schedules read the audible track's seek (0.5 of 1.5 → 1000ms);
        // the old code computed the second delay from the stopped alarm
        // track (seek 0 → a full off-boundary 1500ms).
        expect(scene.time.timers[1].delay).toBe(1000);

        scene.time.timers[0].fire(); // no-op: consumed by remove()
        calm.seek = 1.5; // advance to the scheduled boundary (see above)
        scene.time.timers[1].fire();

        const alarm = scene.sound.sounds.get('alarm')!;
        const tense = scene.sound.sounds.get('tense')!;
        expect(alarm.play).not.toHaveBeenCalled();
        expect(tense.play).toHaveBeenCalledTimes(1);
        expect(tense.isPlaying).toBe(true);
        expect(alarm.isPlaying).toBe(false);
    });

    it('superseding back to the audible track cancels the pending swap without scheduling', () => {
        // A audible, pending swap to B, then target back to A: nothing to
        // swap — A is already sounding. The pending B swap must die.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');
        const calm = scene.sound.sounds.get('calm')!;

        mc.smoothSwitch('alarm', 1.5);
        mc.smoothSwitch('calm', 1.5);

        expect(scene.time.delayedCall).toHaveBeenCalledTimes(1);
        expect(scene.time.timers[0].remove).toHaveBeenCalled();
        scene.time.timers[0].fire(); // no-op

        expect(mc.isPlaying('calm')).toBe(true);
        expect(calm.isPlaying).toBe(true);
        expect(scene.sound.sounds.get('alarm')!.play).not.toHaveBeenCalled();
    });

    it('re-aligns to the next boundary instead of swapping when the timer fired mid-tact', () => {
        // ESC pause freezes the scene clock while the game-scoped sound
        // keeps playing — the timer then fires at a stale boundary. Model:
        // advance the audible track's seek past the boundary before firing.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');
        const calm = scene.sound.sounds.get('calm')!;
        calm.seek = 0.5;

        mc.smoothSwitch('alarm', 1.5);
        expect(scene.time.timers[0].delay).toBe(1000);

        // Simulate a ~0.9s pause: at fire time the seek sits mid-tact.
        calm.seek = 2.4; // 2.4 % 1.5 = 0.9 → 900ms drift, off-boundary
        scene.time.timers[0].fire();

        const alarm = scene.sound.sounds.get('alarm')!;
        expect(alarm.play).not.toHaveBeenCalled();
        // Rescheduled onto the next true boundary: (1.5 - 0.9) * 1000
        // (float-tolerant — IEEE 754 gives 600.0000000000001).
        expect(scene.time.delayedCall).toHaveBeenCalledTimes(2);
        expect(scene.time.timers[1].delay).toBeCloseTo(600, 6);

        calm.seek = 3.0; // on the boundary now (3.0 % 1.5 = 0)
        scene.time.timers[1].fire();
        expect(alarm.play).toHaveBeenCalledWith({ seek: 3.0 });
        expect(alarm.isPlaying).toBe(true);
    });
});

describe('MusicController.stopAll', () => {
    it('defuses a pending swap so it cannot resurrect music after level end', () => {
        // endLevel can stopAll() in the same clock pass an already-elapsed
        // swap timer fires in; the cancel prevents the swap from starting
        // (and looping) a track over the Win/GameOver screen.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');

        mc.smoothSwitch('alarm', 1.5);
        mc.stopAll();
        scene.time.timers[0].fire(); // would have swapped without the cancel

        const alarm = scene.sound.sounds.get('alarm')!;
        expect(scene.time.timers[0].remove).toHaveBeenCalled();
        expect(alarm.play).not.toHaveBeenCalled();
        expect(alarm.isPlaying).toBe(false);
        expect(mc.isPlaying('alarm')).toBe(false);
    });

    it('stops every registered track and clears current', () => {
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('calm');
        const calm = scene.sound.sounds.get('calm')!;
        const alarm = scene.sound.sounds.get('alarm')!;
        // Clear pre-stopAll stop counts (play() already stopped alarm once).
        calm.stop.mockClear();
        alarm.stop.mockClear();

        mc.stopAll();

        expect(calm.stop).toHaveBeenCalledTimes(1);
        expect(alarm.stop).toHaveBeenCalledTimes(1);
        expect(mc.isPlaying('calm')).toBe(false);
        expect(mc.isPlaying('alarm')).toBe(false);
    });
});

describe('MusicController.isPlaying', () => {
    it('returns true only for the current track', () => {
        const { mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.play('alarm');

        expect(mc.isPlaying('calm')).toBe(false);
        expect(mc.isPlaying('alarm')).toBe(true);
        expect(mc.isPlaying('unregistered')).toBe(false);
    });
});

describe('MusicController.setVolume', () => {
    it('applies the value to every registered track', () => {
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');

        mc.setVolume(0.5);

        expect(scene.sound.sounds.get('calm')?.setVolume).toHaveBeenCalledWith(0.5);
        expect(scene.sound.sounds.get('alarm')?.setVolume).toHaveBeenCalledWith(0.5);
    });

    it('clamps negative input to 0', () => {
        const { scene, mc } = setup();
        mc.register('calm');

        mc.setVolume(-1);

        expect(scene.sound.sounds.get('calm')?.setVolume).toHaveBeenCalledWith(0);
    });

    it('clamps input above 1 to 1', () => {
        const { scene, mc } = setup();
        mc.register('calm');

        mc.setVolume(2.5);

        expect(scene.sound.sounds.get('calm')?.setVolume).toHaveBeenCalledWith(1);
    });

    it('is a no-op when no tracks are registered', () => {
        const { mc } = setup();
        // No tracks registered. Should not throw.
        expect(() => mc.setVolume(0.5)).not.toThrow();
    });
});
