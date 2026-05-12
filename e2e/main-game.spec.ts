import { test, expect, type Page } from '@playwright/test';

// End-to-end smoke + 4 core scenarios for slick_hand_joe.
//
// What these test that vitest can't: scene-lifecycle ordering (init →
// create → update), real Phaser keyboard input wiring, real arcade-physics
// collider firing, scene-to-scene transitions (MainGame ↔ Win/GameOver).
// The motivating bug: handFSM.step() called in create() before cursors
// initialized — passed unit tests, blew up on first browser load.
// Playwright is the natural backstop for that class of bug.
//
// Tests inspect game state via the `window.__game` escape hatch (exposed
// in src/main.ts). They avoid canvas-pixel comparison — too flaky for a
// canvas game where animations shift positions each frame.

// Cast helper so test bodies don't repeat `as unknown as { ... }`.
type GameWindow = Window & {
    __game?: Phaser.Game;
};

// localStorage seed for tests that need predictable game pacing.
// Long timer so tests don't end via timer-expiry by accident; SFX volume 0
// so the headless runner doesn't try (and fail) to play audio.
async function seedSettings(page: Page, overrides: Record<string, unknown> = {}): Promise<void> {
    await page.addInitScript((settings) => {
        localStorage.setItem('slick_hand_joe:settings', JSON.stringify(settings));
    }, {
        musicVolume: 0,
        sfxVolume: 0,
        muted: false,
        lootTargetOverride: null,
        timerOverride: 300,
        ...overrides,
    });
}

// Boilerplate: load the page, skip MainMenu directly into MainGame, then
// wait until handFSM is initialized (otherwise tests racing against
// scene-create lose). We bypass the "press Space" path because Phaser's
// keyboard listeners need the canvas focused; Playwright's headless
// keyboard goes to <body> and Phaser's KeyCode.SPACE poll never sees it
// reliably. Going through SceneManager.start is what MainMenu does
// internally on Space anyway.
async function loadAndStart(page: Page): Promise<void> {
    await page.goto('/');
    // Wait for Phaser to finish Boot + Preloader + reach MainMenu. The
    // game instance exists from main.ts's DOMContentLoaded handler, but
    // its scenes init asynchronously after Preloader's asset loads.
    await page.waitForFunction(() => {
        return (window as GameWindow).__game?.scene.isActive('MainMenu') ?? false;
    }, { timeout: 15_000 });

    // Transition to MainGame the same way MainMenu's Space handler would.
    // Stop MainMenu first so it doesn't keep running update() in parallel.
    await page.evaluate(() => {
        const g = (window as GameWindow).__game!;
        g.scene.stop('MainMenu');
        g.scene.start('MainGame');
    });

    await page.waitForFunction(() => {
        const g = (window as GameWindow).__game;
        if (!g?.scene.isActive('MainGame')) return false;
        const scene = g.scene.getScene('MainGame') as Phaser.Scene & { handFSM?: unknown };
        return scene.handFSM !== undefined;
    }, { timeout: 10_000 });
}

// ────────────────────────────────────────────────────────────────────────
// 1. Smoke — page loads, MainGame creates, runs without JS errors
// ────────────────────────────────────────────────────────────────────────

test('MainGame creates and runs without JS errors', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));

    await seedSettings(page);
    await loadAndStart(page);

    // Let the scene run a few seconds — collider polling, FSM stepping,
    // timer text refresh all fire every frame. Any of them throwing
    // would surface via the pageerror listener.
    await page.waitForTimeout(2000);

    expect(errors, errors.map((e) => e.message).join('\n')).toEqual([]);
});

// ────────────────────────────────────────────────────────────────────────
// 2. Hand movement — arrow keys change the hand's direction
// ────────────────────────────────────────────────────────────────────────

test('arrow keys change hand direction', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);

    // Hand starts moving Left by default (set in init()).
    const initialDir = await page.evaluate(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & { lastDirection?: string };
        return scene.lastDirection;
    });
    expect(initialDir).toBe('left');

    // Hand spawn x = SCREEN_CENTER.x = 640, solidly inside the vertical-safe
    // zone (418.5 to 851.5), so L→U is allowed.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(200); // a few frames for transition + a touch of vertical motion
    await page.keyboard.up('ArrowUp');

    const newDir = await page.evaluate(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & { lastDirection?: string };
        return scene.lastDirection;
    });
    expect(newDir).toBe('up');
});

// ────────────────────────────────────────────────────────────────────────
// 3. Stun — driving the hand into a wall triggers StunnedState
// ────────────────────────────────────────────────────────────────────────

test('hitting the top wall triggers stun', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);

    // Travel: hand starts at y=410. Top wall's bottom edge ≈ y=57 (with
    // jitter). Vertical hand half-height = 53, so hand body top reaches
    // the wall at hand center y ≈ 110. Distance to traverse: 410-110 =
    // 300px at HAND_SPEED=300px/s = ~1s of upward motion. Use 1.5s to
    // give margin.
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowUp');

    const isStunned = await page.evaluate(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            handFSM?: { is: (name: string) => boolean };
        };
        return scene.handFSM?.is('stunned') ?? false;
    });
    expect(isStunned).toBe(true);
});

// ────────────────────────────────────────────────────────────────────────
// 4. Win — sweep until pickup with lootTargetOverride=1 launches Win scene
// ────────────────────────────────────────────────────────────────────────

test('reaching loot target triggers Win scene', async ({ page }) => {
    // DEV-only override drops the win threshold to 1 loot pickup. Long
    // timer so the sweep doesn't lose to expiry.
    await seedSettings(page, { lootTargetOverride: 1 });
    await loadAndStart(page);

    // Loot spawns at random y in the arcade (~85..465). Hand at y=410 only
    // intersects the loot row range without moving. Sweep around the
    // compass to cover most of the arcade. Order matters: the hand FSM
    // only allows perpendicular transitions (L↔R via U/D and vice versa),
    // so the sequence is clockwise: Up → Right → Down → Left.
    const compass: ('ArrowUp' | 'ArrowRight' | 'ArrowDown' | 'ArrowLeft')[] = [
        'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft',
    ];

    for (let i = 0; i < 40; i++) {
        const won = await page.evaluate(() => {
            return (window as GameWindow).__game!.scene.isActive('Win');
        });
        if (won) break;

        const dir = compass[i % compass.length];
        await page.keyboard.down(dir);
        await page.waitForTimeout(400); // ~120px travel
        await page.keyboard.up(dir);
    }

    await expect.poll(
        () => page.evaluate(() => (window as GameWindow).__game!.scene.isActive('Win')),
        { timeout: 30_000 },
    ).toBe(true);
});

// ────────────────────────────────────────────────────────────────────────
// 5. GameOver — 4 wrong dialogue answers trigger sus-overflow GameOver
// ────────────────────────────────────────────────────────────────────────

test('4 wrong dialogue answers trigger GameOver', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);

    // Wait for the dialogue FSM to enter 'asking' (after the 2s idle), then
    // press a wrong-answer key. Repeat 4 times: progressSus goes 0→1→2→3→4
    // and the 4th wrong overflows to GameOver via endLevel('GameOver').
    for (let i = 0; i < 4; i++) {
        await page.waitForFunction(() => {
            const scene = (window as GameWindow).__game?.scene.getScene('MainGame') as Phaser.Scene & {
                dialogueFSM?: { is: (name: string) => boolean };
            };
            return scene?.dialogueFSM?.is('asking') ?? false;
        }, { timeout: 15_000 });

        // Determine which letter is NOT the right answer. Right-answer-key
        // is set by showAskingUI; we read its keyCode and pick any other
        // S/D/F letter. (Right-answer-key2 is the Cyrillic-fallback hack
        // codepath; pressing S/D/F bypasses it.)
        const wrongKey = await page.evaluate(() => {
            const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
                rightAnswerKey?: { keyCode: number };
            };
            const rightCode = scene.rightAnswerKey?.keyCode ?? 0;
            const codes: Record<string, number> = { S: 83, D: 68, F: 70 };
            for (const letter of ['S', 'D', 'F']) {
                if (codes[letter] !== rightCode) return letter;
            }
            return 'S';
        });

        await page.keyboard.press(wrongKey);

        // Wait for AskingState to exit (it transitions to cooldown on
        // wrong-answer fail, OR the 4th wrong triggers GameOver and the
        // scene pauses entirely — both leave 'asking').
        await page.waitForFunction(() => {
            const game = (window as GameWindow).__game;
            if (!game) return false;
            if (game.scene.isActive('GameOver')) return true; // 4th wrong: early exit
            const scene = game.scene.getScene('MainGame') as Phaser.Scene & {
                dialogueFSM?: { is: (name: string) => boolean };
            };
            return !(scene?.dialogueFSM?.is('asking') ?? true);
        }, { timeout: 6_000 });
    }

    // After 4 wrongs, GameOver scene should be active.
    await expect.poll(
        () => page.evaluate(() => (window as GameWindow).__game!.scene.isActive('GameOver')),
        { timeout: 10_000 },
    ).toBe(true);
});
