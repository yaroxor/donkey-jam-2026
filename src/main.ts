import StartGame from './game/main';

document.addEventListener('DOMContentLoaded', () => {

    const game = StartGame('game-container');

    // Expose for Playwright E2E tests: lets specs inspect scene state
    // (handFSM, lastDirection, collectedLootCount, etc.) without depending
    // on canvas-pixel comparison. Negligible cost in production — it's a
    // static reference, not a real API surface.
    (window as Window & { __game?: typeof game }).__game = game;

});
