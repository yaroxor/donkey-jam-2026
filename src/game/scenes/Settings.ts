import { Scene } from 'phaser';

import { SCREEN_CENTER, MENU_CURSOR, LEVELS, CURRENT_LEVEL_INDEX } from '../config.ts';
import { loadSettings, saveSettings, type GameSettings } from '../settings.ts';

// Settings menu scene. Three rows (music volume, SFX volume, loot target
// tuner) plus a back button. Loot row only renders in DEV builds via
// import.meta.env.DEV — Vite strips it from production bundles entirely.
//
// Each row uses +/- buttons rather than sliders: Phaser has no built-in
// slider primitive, +/- click-handlers match the click-driven UX of
// MainMenu, and uniform layout across all rows keeps the implementation
// simple.
//
// Settings changes save to localStorage immediately. They apply to runtime
// state on the NEXT consumer read (MainGame.init reads loot override and
// music volume; AskingState.fail re-reads sfx volume per call). There's
// no music playing on the menu, so "live music volume change" isn't a
// concern here — that's the mute button's job, inside MainGame.

const TEXT_STYLE = {
    fontFamily: 'Architects Daughter',
    fontSize: '32px',
    color: '#44323f',
};

const TITLE_STYLE = {
    fontFamily: 'Architects Daughter',
    fontSize: '64px',
    color: '#44323f',
};

const BUTTON_TEXT_STYLE = {
    fontFamily: 'Architects Daughter',
    fontSize: '32px',
    color: '#ffffff',
};

const BUTTON_FILL = 0x44323f;
const BUTTON_FILL_HOVER = 0x6e5563;
const BUTTON_STROKE = 0x000000;
const ADJ_BUTTON_SIZE = 40;
const BACK_BUTTON_WIDTH = 180;
const BACK_BUTTON_HEIGHT = 60;

// Layout — column positions and row Y-coords.
const COL_LABEL = 400;
const COL_VALUE = 720;
const COL_MINUS = 820;
const COL_PLUS = 880;
const Y_TITLE = 80;
const Y_MUSIC = 180;
const Y_SFX = 260;
const Y_LOOT = 340;
const Y_TIMER = 420;
const Y_BACK = 580;

// Adjustment steps and ranges.
const VOLUME_STEP = 0.1;   // 10% per click
const LOOT_STEP = 1;
const LOOT_MIN = 1;
const LOOT_MAX = 25;       // matches the user's stated playtest ceiling
const TIMER_STEP = 10;     // seconds per click
const TIMER_MIN = 10;
const TIMER_MAX = 300;     // 5 minutes; well past any playable heist length

export class Settings extends Scene
{
    private settings: GameSettings;
    private musicValueText: Phaser.GameObjects.Text;
    private sfxValueText: Phaser.GameObjects.Text;
    private lootValueText?: Phaser.GameObjects.Text;
    private timerValueText?: Phaser.GameObjects.Text;

    constructor ()
    {
        super({ key: 'Settings', active: false });
    }

    create ()
    {
        this.input.setDefaultCursor(MENU_CURSOR);
        this.settings = loadSettings();

        // Title.
        this.add.text(SCREEN_CENTER.x, Y_TITLE, 'SETTINGS', TITLE_STYLE).setOrigin(0.5);

        // Music row.
        this.add.text(COL_LABEL, Y_MUSIC, 'Music', TEXT_STYLE).setOrigin(0, 0.5);
        this.musicValueText = this.add.text(
            COL_VALUE, Y_MUSIC,
            this.formatPercent(this.settings.musicVolume),
            TEXT_STYLE,
        ).setOrigin(0.5);
        this.addAdjustButton(COL_MINUS, Y_MUSIC, '-', () => this.adjustMusic(-VOLUME_STEP));
        this.addAdjustButton(COL_PLUS, Y_MUSIC, '+', () => this.adjustMusic(+VOLUME_STEP));

        // SFX row.
        this.add.text(COL_LABEL, Y_SFX, 'SFX', TEXT_STYLE).setOrigin(0, 0.5);
        this.sfxValueText = this.add.text(
            COL_VALUE, Y_SFX,
            this.formatPercent(this.settings.sfxVolume),
            TEXT_STYLE,
        ).setOrigin(0.5);
        this.addAdjustButton(COL_MINUS, Y_SFX, '-', () => this.adjustSfx(-VOLUME_STEP));
        this.addAdjustButton(COL_PLUS, Y_SFX, '+', () => this.adjustSfx(+VOLUME_STEP));

        // DEV-only tuners. Vite dead-code-eliminates the whole block from
        // production bundles when import.meta.env.DEV is statically false.
        // When the override is null (never touched), display the current
        // LEVELS default so the user sees the effective in-game value —
        // first +/- click then engages the override.
        if (import.meta.env.DEV) {
            const levelDefault = LEVELS[CURRENT_LEVEL_INDEX];

            this.add.text(COL_LABEL, Y_LOOT, 'Loot', TEXT_STYLE).setOrigin(0, 0.5);
            const lootInitial = this.settings.lootTargetOverride ?? levelDefault.lootTarget;
            this.lootValueText = this.add.text(
                COL_VALUE, Y_LOOT, `${lootInitial}`, TEXT_STYLE,
            ).setOrigin(0.5);
            this.addAdjustButton(COL_MINUS, Y_LOOT, '-', () => this.adjustLoot(-LOOT_STEP));
            this.addAdjustButton(COL_PLUS, Y_LOOT, '+', () => this.adjustLoot(+LOOT_STEP));

            this.add.text(COL_LABEL, Y_TIMER, 'Timer', TEXT_STYLE).setOrigin(0, 0.5);
            const timerInitial = this.settings.timerOverride ?? levelDefault.timerSeconds;
            this.timerValueText = this.add.text(
                COL_VALUE, Y_TIMER, `${timerInitial}s`, TEXT_STYLE,
            ).setOrigin(0.5);
            this.addAdjustButton(COL_MINUS, Y_TIMER, '-', () => this.adjustTimer(-TIMER_STEP));
            this.addAdjustButton(COL_PLUS, Y_TIMER, '+', () => this.adjustTimer(+TIMER_STEP));
        }

        // Back button.
        this.addBackButton();
    }

    private addAdjustButton(centerX: number, centerY: number, label: string, onClick: () => void): void {
        // Default center origin, positioned at the visual center — the
        // repo-wide pattern for interactives. Phaser hit-tests the default
        // hit area through the origin correctly (probe-verified on 3.90;
        // the earlier setOrigin(0) + top-left workaround here was based on
        // an offset gotcha that did not reproduce). The e2e button probe
        // clicks these at their centers.
        const rect = this.add.rectangle(centerX, centerY, ADJ_BUTTON_SIZE, ADJ_BUTTON_SIZE, BUTTON_FILL);
        rect.setStrokeStyle(2, BUTTON_STROKE);
        rect.setInteractive();
        rect.on('pointerover', () => rect.setFillStyle(BUTTON_FILL_HOVER));
        rect.on('pointerout',  () => rect.setFillStyle(BUTTON_FILL));
        rect.on('pointerdown', onClick);
        this.add.text(centerX, centerY, label, BUTTON_TEXT_STYLE).setOrigin(0.5);
    }

    private addBackButton(): void {
        const centerX = SCREEN_CENTER.x;
        const centerY = Y_BACK;
        const rect = this.add.rectangle(centerX, centerY, BACK_BUTTON_WIDTH, BACK_BUTTON_HEIGHT, BUTTON_FILL);
        rect.setStrokeStyle(2, BUTTON_STROKE);
        rect.setInteractive();
        rect.on('pointerover', () => rect.setFillStyle(BUTTON_FILL_HOVER));
        rect.on('pointerout',  () => rect.setFillStyle(BUTTON_FILL));
        rect.on('pointerdown', () => this.scene.start('MainMenu'));
        this.add.text(centerX, centerY, 'BACK', BUTTON_TEXT_STYLE).setOrigin(0.5);
    }

    private adjustMusic(delta: number): void {
        this.settings.musicVolume = clamp01(this.settings.musicVolume + delta);
        this.musicValueText.setText(this.formatPercent(this.settings.musicVolume));
        saveSettings(this.settings);
    }

    private adjustSfx(delta: number): void {
        this.settings.sfxVolume = clamp01(this.settings.sfxVolume + delta);
        this.sfxValueText.setText(this.formatPercent(this.settings.sfxVolume));
        saveSettings(this.settings);
    }

    private adjustLoot(delta: number): void {
        const current = this.settings.lootTargetOverride ?? LEVELS[CURRENT_LEVEL_INDEX].lootTarget;
        const next = Math.max(LOOT_MIN, Math.min(LOOT_MAX, current + delta));
        this.settings.lootTargetOverride = next;
        this.lootValueText?.setText(`${next}`);
        saveSettings(this.settings);
    }

    private adjustTimer(delta: number): void {
        const current = this.settings.timerOverride ?? LEVELS[CURRENT_LEVEL_INDEX].timerSeconds;
        const next = Math.max(TIMER_MIN, Math.min(TIMER_MAX, current + delta));
        this.settings.timerOverride = next;
        this.timerValueText?.setText(`${next}s`);
        saveSettings(this.settings);
    }

    private formatPercent(v: number): string {
        return `${Math.round(v * 100)}%`;
    }
}

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}
