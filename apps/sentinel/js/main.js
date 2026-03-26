// Sentinel - Main Entry Point
// 게임 초기화 + 게임 루프

(function() {
    'use strict';

    let lastTime = 0;

    function init() {
        console.log('[Sentinel] Initializing game...');

        // 캔버스 설정
        const canvas = document.getElementById('gameCanvas');
        if (!canvas) {
            console.error('[Sentinel] Canvas not found!');
            return;
        }

        const config = Sentinel.config;
        canvas.width = config.canvasWidth;
        canvas.height = config.canvasHeight;

        // 매니저 초기화
        Sentinel.managers.audio = new Sentinel.classes.AudioManager();
        Sentinel.managers.path = new Sentinel.classes.PathManager();
        Sentinel.managers.wave = new Sentinel.classes.WaveManager();

        // 게임 인스턴스 생성
        Sentinel.game = new Sentinel.classes.Game(canvas);

        // UI 매니저
        new Sentinel.classes.UIManager(Sentinel.game);

        // 게임 루프 시작
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);

        console.log('[Sentinel] Game started!');
        console.log('[Sentinel] Click a tower type in the sidebar, then click on the map to place it');
        console.log('[Sentinel] Click "Start Wave" to begin');
    }

    function gameLoop(timestamp) {
        const dt = Math.min((timestamp - lastTime) / 1000, 0.1); // dt 최대값 제한
        lastTime = timestamp;

        const game = Sentinel.game;

        // 업데이트 (일시정지/게임오버가 아닐 때만)
        if (!game.isPaused && !game.isGameOver && !game.isVictory) {
            game.update(dt * game.speed);
        }

        // 렌더링 (항상)
        game.render();

        requestAnimationFrame(gameLoop);
    }

    // DOMContentLoaded 이벤트에서 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[Sentinel] Main.js loaded');
})();
