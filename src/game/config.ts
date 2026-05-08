export const GAME_WIDTH: number = 1280;
export const GAME_HEIGHT: number = 720;
interface Position {
  x: number,
  y: number
};
export const SCREEN_CENTER: Position = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT / 2
}

// Game-feel tuning.
export const HAND_SPEED: number = 300; // px/s
// Music tact is ~3s; switches happen on the half-tact for smoothness.
export const MUSIC_HALF_TACT_SECONDS: number = 1.5;
