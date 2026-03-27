// Sentinel - Main Entry Point (폴리싱 버전)

(function() {
    'use strict';

    var lastTime = 0;

    function init() {
        var canvas = document.getElementById('gameCanvas');
        if (!canvas) {
            console.error('[Sentinel] Canvas not found!');
            return;
        }

        var config = Sentinel.config;
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

        // 반응형 캔버스
        resizeCanvas(canvas);
        window.addEventListener('resize', function() { resizeCanvas(canvas); });

        // 게임 루프 시작
        lastTime = performance.now();
        requestAnimationFrame(gameLoop);

        console.log('[Sentinel] Ready!');
    }

    function resizeCanvas(canvas) {
        var maxW = window.innerWidth - 20;
        var maxH = window.innerHeight - 20;
        var ratio = canvas.width / canvas.height;

        var w = maxW;
        var h = w / ratio;
        if (h > maxH) {
            h = maxH;
            w = h * ratio;
        }

        canvas.style.width = Math.floor(w) + 'px';
        canvas.style.height = Math.floor(h) + 'px';
    }

    function gameLoop(timestamp) {
        var dt = Math.min((timestamp - lastTime) / 1000, 0.1);
        lastTime = timestamp;

        var game = Sentinel.game;
        game.update(dt * game.speed);
        game.render();

        requestAnimationFrame(gameLoop);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
