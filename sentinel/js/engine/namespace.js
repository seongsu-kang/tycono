(function() {
    'use strict';

    window.Sentinel = {
        // Canvas
        CANVAS_WIDTH: 960,
        CANVAS_HEIGHT: 540,

        // Layout
        HUD_HEIGHT: 60,
        SIDE_PANEL_WIDTH: 240,
        GAME_BOARD_WIDTH: 720,
        GAME_BOARD_HEIGHT: 480,
        GAME_BOARD_X: 0,
        GAME_BOARD_Y: 60,
        SIDE_PANEL_X: 720,
        SIDE_PANEL_Y: 60,

        // Colors
        COLORS: {
            // Background
            DEEP_NIGHT: '#0a0e1a',
            DARK_SLATE: '#1a2332',
            STEEL_BLUE: '#2a3342',
            SLATE_GRAY: '#3a4352',
            PATH_STONE: '#3d4a5c',

            // Accents
            NEON_CYAN: '#00d9ff',
            ELECTRIC_GREEN: '#00ff99',
            NEON_PINK: '#ff00aa',
            WARNING_ORANGE: '#ffaa00',
            DANGER_RED: '#ff4444',
            GOLD_YELLOW: '#ffdd00',
            PURPLE: '#aa55ff',

            // Towers
            TOWER_ARROW: '#00ff99',
            TOWER_CANNON: '#ff6600',
            TOWER_SLOW: '#00aaff',
            TOWER_SNIPER: '#ff00aa',
            TOWER_AMPLIFIER: '#ffdd00',
            TOWER_TESLA: '#aa55ff',
            TOWER_FLAME: '#ff4400',
            TOWER_VOID: '#8800ff',

            // Enemies
            ENEMY_SCOUT: '#aa5555',
            ENEMY_SOLDIER: '#5555aa',
            ENEMY_RUNNER: '#55aaaa',
            ENEMY_SWARMER: '#aa8855',
            ENEMY_TANK: '#55aa55',
            ENEMY_HEALER: '#55cc55',
            ENEMY_BERSERKER: '#cc3333',
            ENEMY_SHIELD_BEARER: '#5588cc',
            ENEMY_SPLITTER: '#cc55cc',
            ENEMY_MINOR_BOSS: '#dd8800',
            ENEMY_FINAL_BOSS: '#ff2266'
        },

        // Timing
        TIMINGS: {
            TOWER_PLACE: 200,
            PROJECTILE_SPEED: 300,
            ENEMY_HIT_FLASH: 100,
            ENEMY_DEATH: 300,
            GOLD_POPUP: 800,
            HP_BAR_CHANGE: 150,
            WAVE_START: 400,
            MODAL_FADE: 500,
            BOSS_WARNING: 3000
        },

        // Speed
        SPEED_MULTIPLIERS: [1.0, 2.0, 3.0],

        // Difficulty
        DIFFICULTY: {
            easy:   { gold: 250, lives: 30, hpMult: 0.8, spdMult: 0.9, rewardMult: 1.2, interest: 0.08 },
            normal: { gold: 200, lives: 20, hpMult: 1.0, spdMult: 1.0, rewardMult: 1.0, interest: 0.05 },
            hard:   { gold: 150, lives: 10, hpMult: 1.3, spdMult: 1.1, rewardMult: 0.85, interest: 0.03 }
        },

        // Tower type list (order for sidebar)
        TOWER_TYPES: ['arrow', 'cannon', 'slow', 'sniper', 'amplifier', 'tesla', 'flame', 'void'],

        // Data containers
        data: {
            towers: {},
            enemies: {},
            waves: {},
            maps: {},
            heroes: {}
        },

        // Runtime
        game: null,
        audio: null,
        input: null,
        renderer: null
    };
})();
