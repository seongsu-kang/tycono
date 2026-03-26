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
            initialGold: 150,
            initialLives: 15,
            totalWaves: 10
        },

        // 색상 팔레트
        colors: {
            // 배경
            deepNight: '#0a0e1a',
            darkSlate: '#1a2332',
            steelBlue: '#2a3342',
            slateGray: '#3a4352',
            pathStone: '#3d4a5c',

            // 강조
            neonCyan: '#00d9ff',
            electricGreen: '#00ff99',
            neonPink: '#ff00aa',
            warningOrange: '#ffaa00',
            dangerRed: '#ff4444',
            goldYellow: '#ffdd00',

            // 타워
            towerArrow: '#00ff99',
            towerCannon: '#ff6600',
            towerSlow: '#00aaff',
            towerSniper: '#ff00aa',

            // 적
            enemyScout: '#aa5555',
            enemySoldier: '#5555aa',
            enemyTank: '#55aa55',
            enemyHealer: '#aaaa55',
            enemyBoss: '#aa55aa'
        },

        // 게임 데이터 (towers.js, enemies.js, waves.js에서 채움)
        data: {
            towers: {},
            enemies: {},
            waves: []
        },

        // 유틸리티 함수
        utils: {},

        // 클래스 저장소
        classes: {},

        // 매니저 인스턴스
        managers: {
            audio: null,
            path: null,
            wave: null
        },

        // 게임 인스턴스 (main.js에서 생성)
        game: null
    };

    console.log('[Sentinel] Namespace initialized');
})();
