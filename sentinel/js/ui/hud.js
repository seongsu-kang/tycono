(function() {
    'use strict';
    var S = window.Sentinel;

    S.HUD = {
        render: function(ctx, game) {
            var C = S.COLORS;

            // HUD background
            ctx.fillStyle = C.STEEL_BLUE;
            ctx.fillRect(0, 0, S.CANVAS_WIDTH, S.HUD_HEIGHT);

            // Bottom border
            ctx.strokeStyle = C.SLATE_GRAY;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, S.HUD_HEIGHT);
            ctx.lineTo(S.CANVAS_WIDTH, S.HUD_HEIGHT);
            ctx.stroke();

            // Wave info (left)
            ctx.fillStyle = C.NEON_CYAN;
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('WAVE', 20, 18);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(game.waveManager.currentWave + '/' + game.waveManager.totalWaves, 20, 42);

            // Lives (center-left)
            var livesColor = game.lives > game.maxLives * 0.5 ? C.ELECTRIC_GREEN :
                            game.lives > game.maxLives * 0.25 ? C.WARNING_ORANGE : C.DANGER_RED;

            // Heart icon
            ctx.fillStyle = livesColor;
            ctx.beginPath();
            ctx.arc(170, 25, 6, 0, Math.PI * 2);
            ctx.arc(182, 25, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(164, 27);
            ctx.lineTo(176, 40);
            ctx.lineTo(188, 27);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(game.lives, 198, 30);

            // Gold (center)
            ctx.fillStyle = C.GOLD_YELLOW;
            ctx.beginPath();
            ctx.arc(320, 30, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('G', 320, 30);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(game.gold, 340, 30);

            // Speed indicator (center-right)
            var speedLabels = ['1x', '2x', '3x'];
            var speedColors = ['#ffffff', C.WARNING_ORANGE, C.DANGER_RED];
            var si = game.speedIndex || 0;

            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(480, 10, 70, 40);
            ctx.strokeStyle = speedColors[si];
            ctx.lineWidth = 2;
            ctx.strokeRect(480, 10, 70, 40);

            ctx.fillStyle = speedColors[si];
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(speedLabels[si], 515, 30);

            // Pause button
            ctx.fillStyle = game.isPaused ? C.WARNING_ORANGE : C.DARK_SLATE;
            ctx.fillRect(560, 10, 60, 40);
            ctx.strokeStyle = C.WARNING_ORANGE;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(560, 10, 60, 40);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(game.isPaused ? '▶' : '⏸', 590, 30);

            // Mute button
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(630, 10, 40, 40);
            ctx.strokeStyle = C.SLATE_GRAY;
            ctx.lineWidth = 1;
            ctx.strokeRect(630, 10, 40, 40);

            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Arial';
            ctx.fillText(S.audio && S.audio.muted ? '🔇' : '🔊', 650, 30);

            // Map name + difficulty
            ctx.fillStyle = '#888888';
            ctx.font = '11px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(game.mapData.name + ' | ' + game.difficulty.charAt(0).toUpperCase() + game.difficulty.slice(1), S.CANVAS_WIDTH - 15, 30);
        },

        // HUD click areas
        getClickArea: function(x, y) {
            if (y < 0 || y > S.HUD_HEIGHT) return null;
            if (x >= 480 && x < 550) return 'speed';
            if (x >= 560 && x < 620) return 'pause';
            if (x >= 630 && x < 670) return 'mute';
            return null;
        }
    };
})();
