import { defineConfig, devices } from '@playwright/test';

// Playwright config for slick_hand_joe end-to-end smoke + scenario tests.
//
// Project policy: vitest covers pure-TS surfaces (utils, StateMachine,
// settings, hand-states, dialogue-states). Phaser-coupled paths (scene
// lifecycle, collider callbacks, input wiring) are intentionally deferred
// from vitest — they need a real browser to exercise. This config runs
// those tests against a built artifact via `vite preview`.
//
// Run: `bun run test:e2e`
//
// One-shot debugging: `bunx playwright test --headed` (visible browser).
// `bunx playwright show-report` after a run shows the HTML report.

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,            // 60s per test — game flows are slower than DOM tests
    expect: { timeout: 5_000 },
    fullyParallel: false,       // game tests share localStorage / window state
    workers: 1,                 // serial; running parallel Phaser instances thrashes the system
    retries: 0,                 // game tests must be deterministic; retries hide flakiness
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },
    projects: [
        {
            // Chromium only — Phaser canvas rendering is the same across
            // engines, and CI/local cost matters more than browser coverage
            // for a hobby game.
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        // Use the dev server so `import.meta.env.DEV` is true — that
        // unlocks the loot-target / timer override settings tests rely on
        // for deterministic pacing. Production-build correctness is
        // already validated by the regular `bun run build` step in CI.
        // Dev port 5173 differs from preview port 4173.
        command: 'bun run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
});
