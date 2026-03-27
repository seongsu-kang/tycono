// Sentinel Tower Defense - Global Namespace
// file:// 프로토콜 대응을 위한 글로벌 네임스페이스 패턴

(function() {
    'use strict';

    window.Sentinel = {
        // 설정
        config: {
            gridWidth: 15,
            gridHeight: 10,
            cellSize: 48,
            canvasWidth: 960,
            canvasHeight: 540,
            gameWidth: 720,
            gameHeight: 480,
            sidebarWidth: 240,
            hudHeight: 60,
            totalWaves: 10
        },

        // 난이도 설정
        difficulties: {
            easy: {
                name: 'Easy',
                gold: 200,
                lives: 25,
                hpMultiplier: 0.8,
                speedMultiplier: 0.9,
                rewardMultiplier: 1.2,
                accentColor: '#00ff99',
                stars: 1
            },
            normal: {
                name: 'Normal',
                gold: 150,
                lives: 20,
                hpMultiplier: 1.0,
                speedMultiplier: 1.0,
                rewardMultiplier: 1.0,
                accentColor: '#00d9ff',
                stars: 2
            },
            hard: {
                name: 'Hard',
                gold: 100,
                lives: 12,
                hpMultiplier: 1.2,
                speedMultiplier: 1.1,
                rewardMultiplier: 0.9,
                accentColor: '#ff4444',
                stars: 3
            }
        },

        // 색상 팔레트
        colors: {
            deepNight: '#0a0e1a',
            darkSlate: '#1a2332',
            steelBlue: '#2a3342',
            slateGray: '#3a4352',
            midGray: '#4a5362',
            pathStone: '#3d4a5c',

            neonCyan: '#00d9ff',
            electricGreen: '#00ff99',
            neonPink: '#ff00aa',
            warningOrange: '#ffaa00',
            dangerRed: '#ff4444',
            goldYellow: '#ffdd00',

            towerArrow: '#00ff99',
            towerCannon: '#ff6600',
            towerSlow: '#00aaff',
            towerSniper: '#ff00aa',

            enemyScout: '#aa5555',
            enemySoldier: '#5555aa',
            enemyTank: '#55aa55',
            enemyHealer: '#aaaa55',
            enemyBoss: '#aa55aa'
        },

        // 타이밍 상수
        TIMINGS: {
            GOLD_POPUP: 800,
            ENEMY_DEATH: 300,
            WAVE_COMPLETE: 2000,
            BOSS_WARNING: 1500
        },

        // 게임 데이터
        data: { towers: {}, enemies: {}, waves: [] },
        utils: {},
        classes: {},
        managers: { audio: null, path: null, wave: null },
        game: null
    };

    console.log('[Sentinel] Namespace initialized');
})();
