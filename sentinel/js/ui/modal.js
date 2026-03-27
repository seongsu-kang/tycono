(function() {
    'use strict';
    var S = window.Sentinel;

    S.Modal = {
        // ---- Pause Modal ----
        renderPause: function(ctx) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, W, H);

            var mw = 300, mh = 220;
            var mx = (W - mw) / 2, my = (H - mh) / 2;

            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(mx, my, mw, mh);
            ctx.strokeStyle = C.WARNING_ORANGE;
            ctx.lineWidth = 2;
            ctx.strokeRect(mx, my, mw, mh);

            ctx.fillStyle = C.WARNING_ORANGE;
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('PAUSED', mx + mw / 2, my + 40);

            // Resume
            this._drawButton(ctx, mx + 50, my + 80, 200, 36, 'Resume', C.ELECTRIC_GREEN);
            // Restart
            this._drawButton(ctx, mx + 50, my + 126, 200, 36, 'Restart', C.WARNING_ORANGE);
            // Quit
            this._drawButton(ctx, mx + 50, my + 172, 200, 36, 'Quit to Menu', C.DANGER_RED);
        },

        handlePauseClick: function(x, y) {
            var W = S.CANVAS_WIDTH, H = S.CANVAS_HEIGHT;
            var mw = 300, mh = 220;
            var mx = (W - mw) / 2, my = (H - mh) / 2;

            if (S.Utils.pointInRect(x, y, mx + 50, my + 80, 200, 36)) return 'resume';
            if (S.Utils.pointInRect(x, y, mx + 50, my + 126, 200, 36)) return 'restart';
            if (S.Utils.pointInRect(x, y, mx + 50, my + 172, 200, 36)) return 'quit';
            return null;
        },

        // ---- Game Over Modal ----
        renderGameOver: function(ctx, game) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, W, H);

            var mw = 400, mh = 320;
            var mx = (W - mw) / 2, my = (H - mh) / 2;

            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(mx, my, mw, mh);
            ctx.strokeStyle = C.DANGER_RED;
            ctx.lineWidth = 3;
            ctx.strokeRect(mx, my, mw, mh);

            ctx.fillStyle = C.DANGER_RED;
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = C.DANGER_RED;
            ctx.shadowBlur = 15;
            ctx.fillText('GAME OVER', mx + mw / 2, my + 50);
            ctx.shadowBlur = 0;

            // Stats
            ctx.fillStyle = '#cccccc';
            ctx.font = '15px Arial';
            var statsY = my + 100;
            ctx.fillText('Wave: ' + game.waveManager.currentWave + '/' + game.waveManager.totalWaves, mx + mw / 2, statsY);
            ctx.fillText('Enemies Killed: ' + game.killCount, mx + mw / 2, statsY + 28);
            ctx.fillText('Towers Built: ' + game.towerCount, mx + mw / 2, statsY + 56);
            ctx.fillText('Time: ' + S.Utils.formatTime(game.playTime), mx + mw / 2, statsY + 84);

            // Buttons
            this._drawButton(ctx, mx + 50, my + 230, 140, 42, 'Retry', C.NEON_CYAN);
            this._drawButton(ctx, mx + 210, my + 230, 140, 42, 'Menu', C.SLATE_GRAY);
        },

        handleGameOverClick: function(x, y) {
            var W = S.CANVAS_WIDTH, H = S.CANVAS_HEIGHT;
            var mw = 400, mh = 320;
            var mx = (W - mw) / 2, my = (H - mh) / 2;

            if (S.Utils.pointInRect(x, y, mx + 50, my + 230, 140, 42)) return 'retry';
            if (S.Utils.pointInRect(x, y, mx + 210, my + 230, 140, 42)) return 'menu';
            return null;
        },

        // ---- Victory Modal ----
        renderVictory: function(ctx, game) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(0, 0, W, H);

            var mw = 420, mh = 380;
            var mx = (W - mw) / 2, my = (H - mh) / 2;

            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(mx, my, mw, mh);
            ctx.strokeStyle = C.ELECTRIC_GREEN;
            ctx.lineWidth = 3;
            ctx.strokeRect(mx, my, mw, mh);

            ctx.fillStyle = C.ELECTRIC_GREEN;
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = C.ELECTRIC_GREEN;
            ctx.shadowBlur = 15;
            ctx.fillText('VICTORY!', mx + mw / 2, my + 45);
            ctx.shadowBlur = 0;

            // Stars
            var stars = game.getStarRating();
            ctx.font = '40px Arial';
            ctx.fillStyle = C.GOLD_YELLOW;
            var starStr = '';
            for (var i = 0; i < 3; i++) {
                starStr += i < stars ? '★' : '☆';
            }
            ctx.fillText(starStr, mx + mw / 2, my + 95);

            // Star explanation
            ctx.fillStyle = '#888888';
            ctx.font = '12px Arial';
            var starMsg = stars === 3 ? 'Perfect! No lives lost!' :
                         stars === 2 ? 'Great! 50%+ lives remaining' : 'Cleared!';
            ctx.fillText(starMsg, mx + mw / 2, my + 125);

            // Stats
            ctx.fillStyle = '#cccccc';
            ctx.font = '14px Arial';
            var sy = my + 155;
            ctx.fillText('Enemies Killed: ' + game.killCount, mx + mw / 2, sy);
            ctx.fillText('Towers Built: ' + game.towerCount, mx + mw / 2, sy + 24);
            ctx.fillText('Lives Remaining: ' + game.lives + '/' + game.maxLives, mx + mw / 2, sy + 48);
            ctx.fillText('Total Gold Earned: ' + game.totalGoldEarned + 'G', mx + mw / 2, sy + 72);
            ctx.fillText('Time: ' + S.Utils.formatTime(game.playTime), mx + mw / 2, sy + 96);

            // Unlock notification
            if (game.unlockMessage) {
                ctx.fillStyle = C.GOLD_YELLOW;
                ctx.font = 'bold 13px Arial';
                ctx.fillText('🔓 ' + game.unlockMessage, mx + mw / 2, sy + 126);
            }

            // Buttons
            this._drawButton(ctx, mx + 30, my + mh - 60, 160, 42, 'Next Map', C.ELECTRIC_GREEN);
            this._drawButton(ctx, mx + 230, my + mh - 60, 160, 42, 'Map Select', C.NEON_CYAN);
        },

        handleVictoryClick: function(x, y) {
            var W = S.CANVAS_WIDTH, H = S.CANVAS_HEIGHT;
            var mw = 420, mh = 380;
            var mx = (W - mw) / 2, my = (H - mh) / 2;

            if (S.Utils.pointInRect(x, y, mx + 30, my + mh - 60, 160, 42)) return 'next';
            if (S.Utils.pointInRect(x, y, mx + 230, my + mh - 60, 160, 42)) return 'mapSelect';
            return null;
        },

        // Helper
        _drawButton: function(ctx, x, y, w, h, label, color) {
            var C = S.COLORS;
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + w / 2, y + h / 2);
        }
    };
})();
