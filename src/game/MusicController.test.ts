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
//     seek across the boundary, and handles rapid re-entrancy
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

    it('on timer fire: stops other tracks, sets target seek to fromTrack seek, plays target', () => {
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
        const timer = scene.time.timers[0];
        timer.fire();

        // calm was the "from" track — it gets stopped at fire time too (the
        // closure loops every registered track except `toKey`).
        expect(calm.stop).toHaveBeenCalledTimes(1);
        expect(tense.stop).toHaveBeenCalledTimes(1);
        expect(alarm.setSeek).toHaveBeenCalledWith(0.75);
        expect(alarm.play).toHaveBeenCalledTimes(1);
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

    it('rapid different-target re-entrancy schedules a second timer; end state matches last target', () => {
        // play('calm') → smoothSwitch('alarm') → smoothSwitch('tense')
        // Both timers schedule (current was set optimistically each call).
        // After both fire: tense should be the only playing track.
        const { scene, mc } = setup();
        mc.register('calm');
        mc.register('alarm');
        mc.register('tense');
        mc.play('calm');

        mc.smoothSwitch('alarm', 1.5);
        mc.smoothSwitch('tense', 1.5);

        expect(scene.time.delayedCall).toHaveBeenCalledTimes(2);

        // Fire both timers in order. Each timer's closure captured its own
        // (fromTrack, toTrack) at the time of the smoothSwitch call.
        scene.time.timers[0].fire();
        scene.time.timers[1].fire();

        const alarm = scene.sound.sounds.get('alarm')!;
        const tense = scene.sound.sounds.get('tense')!;
        expect(tense.play).toHaveBeenCalledTimes(1);
        expect(tense.isPlaying).toBe(true);
        expect(alarm.isPlaying).toBe(false);
    });
});

describe('MusicController.stopAll', () => {
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
