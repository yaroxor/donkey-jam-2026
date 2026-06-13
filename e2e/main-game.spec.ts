import { test, expect, type Page } from '@playwright/test';

// End-to-end smoke + scenario tests for slick_hand_joe.
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
    // the wall at hand center y ≈ 110. Distance: 410-110 = 300px at
    // HAND_SPEED=300px/s = ~1s of upward motion. Wait on the STATE, not a
    // fixed sleep: if the turn lands over the bottom-center stash column,
    // the vertical body clips the trigger zone and the trip starts with a
    // 1s hide before resuming up — still well inside the 6s budget.
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            handFSM?: { is: (name: string) => boolean };
        };
        return scene.handFSM?.is('stunned') ?? false;
    }, { timeout: 6_000 });
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
        const ended = await page.evaluate(() => {
            const g = (window as GameWindow).__game!;
            return { won: g.scene.isActive('Win'), lost: g.scene.isActive('GameOver') };
        });
        if (ended.won) break;
        // Fail loudly if the sweep dies to sus overflow (wall stuns +
        // unanswered dialogue both feed progressSus) — without this check
        // a mid-sweep GameOver would stall every remaining steerable wait
        // and surface only as an opaque 60s suite timeout.
        expect(ended.lost, 'sweep died to GameOver (sus overflow) before winning').toBe(false);

        // Wait until the hand is steerable before pressing. Stun (1s) and
        // stash-hide (1s) windows ignore keyboard input entirely — a press
        // landing inside one is silently eaten, and on the stash column the
        // hand can chain wall-stun → hide → wall-stun for several seconds.
        // End-scenes count as "done waiting" so the wait can't stall on a
        // finished game; the next pass's ended-check resolves them.
        await page.waitForFunction(() => {
            const g = (window as GameWindow).__game!;
            if (g.scene.isActive('Win') || g.scene.isActive('GameOver')) return true;
            const scene = g.scene.getScene('MainGame') as Phaser.Scene & {
                handFSM?: { is: (name: string) => boolean };
            };
            const fsm = scene.handFSM;
            if (!fsm) return false;
            return (['left', 'right', 'up', 'down'] as const).some((d) => fsm.is(d));
        }, { timeout: 5_000 }).catch(() => {});

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
// 5+6. Alarm (look-at-table) — 4 wrong answers fire the alarm; the check
//      catches an unstashed hand and spares a hidden one
// ────────────────────────────────────────────────────────────────────────

// Drive `count` wrong answers through the dialogue loop, asserting the
// sus-coupled music ladder along the way. The 4th wrong fires the ALARM
// (lookAtTable reaction), not an immediate GameOver.
async function driveWrongAnswers(page: Page, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
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

        // Wait for AskingState to exit (cooldown on a normal wrong-answer
        // fail; the 4th wrong fires the alarm and lands in lookAtTable —
        // both leave 'asking').
        await page.waitForFunction(() => {
            const game = (window as GameWindow).__game;
            if (!game) return false;
            const scene = game.scene.getScene('MainGame') as Phaser.Scene & {
                dialogueFSM?: { is: (name: string) => boolean };
            };
            return !(scene?.dialogueFSM?.is('asking') ?? true);
        }, { timeout: 6_000 });

        // Music follows the sus ladder (SUS_LEVELS): after the i-th wrong
        // answer the controller is on (or tact-switching to) the next
        // track — isPlaying reflects the switch target immediately.
        if (i < 3) {
            const expectedTrack = ['music2', 'music3', 'music4'][i];
            await expect.poll(() => page.evaluate((key) => {
                const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
                    music?: { isPlaying: (k: string) => boolean };
                };
                return scene.music?.isPlaying(key) ?? false;
            }, expectedTrack), { timeout: 3_000 }).toBe(true);
        }
    }
}

test('4 wrong answers fire the alarm; an unstashed hand is caught', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);
    await driveWrongAnswers(page, 4);

    // The 4th wrong fires the ALARM: the dialogue FSM enters the
    // look-at-table reaction and the warning visual shows — the run is
    // NOT over yet.
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            dialogueFSM?: { is: (name: string) => boolean };
            lookOverSprite?: { visible: boolean };
        };
        return (scene.dialogueFSM?.is('lookAtTable') ?? false)
            && (scene.lookOverSprite?.visible ?? false);
    }, { timeout: 5_000 });

    // The hand is roaming, not stashed → the check (2s later) catches
    // it and ends the run.
    await expect.poll(
        () => page.evaluate(() => (window as GameWindow).__game!.scene.isActive('GameOver')),
        { timeout: 10_000 },
    ).toBe(true);
});

test('alarm survived by hiding in the stash: sus settles to baseline', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);
    await driveWrongAnswers(page, 4);

    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            dialogueFSM?: { is: (name: string) => boolean };
        };
        return scene.dialogueFSM?.is('lookAtTable') ?? false;
    }, { timeout: 5_000 });

    // Hide EARLY (~0.5s into the 2s window). The hide's 1s auto-pop would
    // fire at ~1.5s — before the 2.0s check — but the reaction suppresses
    // it, so the hand holds in the stash through the check. (This is the
    // exact fairness bug the hold fixes: pre-hold this hide popped out and
    // got caught.) The hand FSM is nudged directly; steering-into-the-stash
    // is covered by the stash scenario, this test owns the CHECK logic.
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            handFSM?: { transition: (name: string) => void };
        };
        scene.handFSM?.transition('hidden');
    });

    // Check passes → the whole sus-coupled bundle settles and dialogue
    // resumes with the next question.
    await page.waitForFunction(() => {
        const g = (window as GameWindow).__game!;
        if (!g.scene.isActive('MainGame')) return false;
        const scene = g.scene.getScene('MainGame') as Phaser.Scene & {
            dialogueFSM?: { is: (name: string) => boolean };
        };
        return scene.dialogueFSM?.is('asking') ?? false;
    }, { timeout: 5_000 });

    const settled = await page.evaluate(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            currentSus?: number;
            music?: { isPlaying: (k: string) => boolean };
            lookOverSprite?: { visible: boolean };
            handFSM?: { is: (name: string) => boolean };
        };
        return {
            sus: scene.currentSus,
            baselineMusic: scene.music?.isPlaying('music2') ?? false,
            lookVisible: scene.lookOverSprite?.visible,
            handHidden: scene.handFSM?.is('hidden') ?? false,
            gameOver: (window as GameWindow).__game!.scene.isActive('GameOver'),
        };
    });
    expect(settled.sus).toBe(1);
    expect(settled.baselineMusic).toBe(true);
    expect(settled.lookVisible).toBe(false);
    // The held hand was released on survive — back to moving, not stuck hidden.
    expect(settled.handHidden).toBe(false);
    expect(settled.gameOver).toBe(false);
});

// ────────────────────────────────────────────────────────────────────────
// 7. Pause menu — RESUME and LEAVE respond to clicks on their labels
// ────────────────────────────────────────────────────────────────────────

test('pause menu RESUME and LEAVE respond to label clicks', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);
    const canvas = page.locator('canvas');

    // Open the pause menu via the on-screen pause button (Image at
    // GAME_WIDTH-50, GAME_HEIGHT-50 = 1230, 670; 59x57 sprite). No scale
    // manager is configured, so the canvas renders at native 1280x720 and
    // element-relative click positions map 1:1 to game coordinates.
    await canvas.click({ position: { x: 1230, y: 670 } });
    await page.waitForFunction(
        () => (window as GameWindow).__game!.scene.isActive('Pause'),
        { timeout: 5_000 },
    );

    // Click the CENTER of the visible RESUME label, as a player would.
    // Label text measured in paused.png (threshold + trim): x 550..732,
    // y 318..349 → center (641, 334). The original hit zones were
    // hardcoded ~45px below the labels (regression this test pins).
    await canvas.click({ position: { x: 641, y: 334 } });
    await page.waitForFunction(() => {
        const g = (window as GameWindow).__game!;
        return !g.scene.isActive('Pause') && g.scene.isActive('MainGame');
    }, { timeout: 5_000 });

    // Re-open pause, then click the center of the visible LEAVE label
    // (measured: x 569..713, y 416..448 → center 641, 432). Expect
    // MainMenu.
    await canvas.click({ position: { x: 1230, y: 670 } });
    await page.waitForFunction(
        () => (window as GameWindow).__game!.scene.isActive('Pause'),
        { timeout: 5_000 },
    );
    await canvas.click({ position: { x: 641, y: 432 } });
    await page.waitForFunction(
        () => (window as GameWindow).__game!.scene.isActive('MainMenu'),
        { timeout: 5_000 },
    );
});

// ────────────────────────────────────────────────────────────────────────
// 8. Stash — entering the hole's trigger zone hides the hand, then it
//    auto-resumes its direction of travel
// ────────────────────────────────────────────────────────────────────────

test('stepping on a stash hole hides the hand, then auto-resumes', async ({ page }) => {
    await seedSettings(page);
    await loadAndStart(page);

    // Level-1 stash sits at bottom center, (635, 490) (config.ts LEVELS).
    // The hand starts at (640, 410) moving left along y=410, just clear of
    // the trigger (zone top 455 vs horizontal body bottom 443.5). Steer:
    // wait for the sweep to bring hand.x over the stash column (the hand
    // wraps every ~1.7s, so the window always arrives), then turn Down —
    // the vertical body (bottom 463) overlaps the zone immediately.
    // Window math: the vertical hand overlaps the zone for turns at
    // x ∈ [563.5, 706.5]; catching at x ∈ (600, 690) leaves a wide
    // input-latency budget at 300px/s, and the whole window sits inside
    // the vertical-safe-zone gate [418.5, 851.5].
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            lastDirection?: string;
            hand?: { x: number };
        };
        return scene.lastDirection === 'left'
            && (scene.hand?.x ?? 0) > 600 && (scene.hand?.x ?? 0) < 690;
    }, { timeout: 10_000 });

    await page.keyboard.down('ArrowDown');

    // The hide fires as soon as the turned (vertical) body overlaps the
    // zone — effectively right after the turn registers.
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            handFSM?: { is: (name: string) => boolean };
        };
        return scene.handFSM?.is('hidden') ?? false;
    }, { timeout: 5_000 });
    await page.keyboard.up('ArrowDown');

    // While hidden: hand sprite invisible.
    const hiddenVisibility = await page.evaluate(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            hand?: { visible: boolean };
        };
        return scene.hand?.visible;
    });
    expect(hiddenVisibility).toBe(false);

    // Auto-resume after the 1s hide: back in a direction state ('down' —
    // the hide preserves lastDirection rather than bouncing) and visible
    // again. (~0.3s later the resumed hand reaches the bottom wall and
    // stuns; the rAF-polled wait catches the 'down' window comfortably.)
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainGame') as Phaser.Scene & {
            handFSM?: { is: (name: string) => boolean };
            hand?: { visible: boolean };
        };
        return (scene.handFSM?.is('down') ?? false) && (scene.hand?.visible ?? false);
    }, { timeout: 4_000 });
});

// ────────────────────────────────────────────────────────────────────────
// 9. Button probe — every interactive responds at its VISUAL center.
//    Pins the repo convention (default center origin, positioned at the
//    visual center) against regressions and against asset/coordinate
//    drift. Extend this when adding a button.
// ────────────────────────────────────────────────────────────────────────

test('buttons respond at their visual centers', async ({ page }) => {
    await seedSettings(page);
    await page.goto('/');
    await page.waitForFunction(() => {
        return (window as GameWindow).__game?.scene.isActive('MainMenu') ?? false;
    }, { timeout: 15_000 });
    const canvas = page.locator('canvas');
    const settings = () => page.evaluate(
        () => JSON.parse(localStorage.getItem('slick_hand_joe:settings') ?? '{}') as Record<string, unknown>,
    );

    // MainMenu OPTIONS (152x67 sprite centered at 1134, 676.5) → Settings.
    await canvas.click({ position: { x: 1134, y: 677 } });
    await page.waitForFunction(
        () => (window as GameWindow).__game!.scene.isActive('Settings'),
        { timeout: 5_000 },
    );

    // Settings music '+' (40x40 rect centered at 880, 180): seeded volume
    // is 0 (headless audio), one click steps it to 0.1 and saves.
    await canvas.click({ position: { x: 880, y: 180 } });
    await expect.poll(async () => (await settings()).musicVolume).toBeCloseTo(0.1);

    // Settings BACK (180x60 rect centered at 640, 580) → MainMenu.
    await canvas.click({ position: { x: 640, y: 580 } });
    await page.waitForFunction(
        () => (window as GameWindow).__game!.scene.isActive('MainMenu'),
        { timeout: 5_000 },
    );

    // MainMenu INFO (152x67 sprite centered at 986, 676.5) → info screen
    // shows (alpha 1); ESC hides it again (isDown poll in update()).
    await canvas.click({ position: { x: 986, y: 677 } });
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainMenu') as Phaser.Scene & {
            infoScreen?: { alpha: number };
        };
        return scene.infoScreen?.alpha === 1;
    }, { timeout: 5_000 });
    await page.keyboard.down('Escape');
    await page.waitForFunction(() => {
        const scene = (window as GameWindow).__game!.scene.getScene('MainMenu') as Phaser.Scene & {
            infoScreen?: { alpha: number };
        };
        return scene.infoScreen?.alpha === 0;
    }, { timeout: 5_000 });
    await page.keyboard.up('Escape');

    // MainMenu START (300x91 sprite centered at 1058, 604.5) → MainGame.
    await canvas.click({ position: { x: 1058, y: 605 } });
    await page.waitForFunction(() => {
        const g = (window as GameWindow).__game;
        if (!g?.scene.isActive('MainGame')) return false;
        const scene = g.scene.getScene('MainGame') as Phaser.Scene & { handFSM?: unknown };
        return scene.handFSM !== undefined;
    }, { timeout: 10_000 });

    // MainGame HUD: mute (text emoji centered at 1150, 670) flips the
    // persisted muted flag; pause (59x57 sprite centered at 1230, 670)
    // opens the Pause overlay.
    await canvas.click({ position: { x: 1150, y: 670 } });
    await expect.poll(async () => (await settings()).muted).toBe(true);
    await canvas.click({ position: { x: 1230, y: 670 } });
    await page.waitForFunction(
        () => (window as GameWindow).__game!.scene.isActive('Pause'),
        { timeout: 5_000 },
    );
});
