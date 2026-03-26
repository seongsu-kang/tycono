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
            topBarHeight: 40,
            bottomBarHeight: 60,
            initialGold: 200,
            initialLives: 20,
            totalWaves: 10
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
