(function() {
    'use strict';
    var S = window.Sentinel;

    S.Menu = {
        // ---- Main Menu ----
        renderMainMenu: function(ctx) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            // Background
            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.fillRect(0, 0, W, H);

            // Animated grid background
            var time = Date.now() / 2000;
            ctx.strokeStyle = '#1a2332';
            ctx.lineWidth = 1;
            for (var gx = 0; gx < W; gx += 48) {
                ctx.globalAlpha = 0.3 + Math.sin(gx / 48 + time) * 0.15;
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                ctx.lineTo(gx, H);
                ctx.stroke();
            }
            for (var gy = 0; gy < H; gy += 48) {
                ctx.globalAlpha = 0.3 + Math.cos(gy / 48 + time) * 0.15;
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(W, gy);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            // Title
            ctx.fillStyle = C.NEON_CYAN;
            ctx.font = 'bold 64px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = C.NEON_CYAN;
            ctx.shadowBlur = 30;
            ctx.fillText('SENTINEL', W / 2, 140);
            ctx.shadowBlur = 0;

            // Subtitle
            ctx.fillStyle = '#888888';
            ctx.font = '18px Arial';
            ctx.fillText('Tower Defense', W / 2, 190);

            // Buttons
            var buttons = [
                { label: 'PLAY', y: 280 },
                { label: 'HOW TO PLAY', y: 340 },
                { label: 'CREDITS', y: 400 }
            ];

            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                var bw = 240;
                var bh = 50;
                var bx = (W - bw) / 2;
                var by = btn.y;

                ctx.fillStyle = C.DARK_SLATE;
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeStyle = i === 0 ? C.NEON_CYAN : C.STEEL_BLUE;
                ctx.lineWidth = 2;
                ctx.strokeRect(bx, by, bw, bh);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 18px Arial';
                ctx.fillText(btn.label, W / 2, by + bh / 2);
            }

            // Version
            ctx.fillStyle = '#444444';
            ctx.font = '10px Arial';
            ctx.fillText('v1.0 — Phase 1 MVP', W / 2, H - 20);
        },

        handleMainMenuClick: function(x, y) {
            var W = S.CANVAS_WIDTH;
            var bw = 240;
            var bx = (W - bw) / 2;

            if (S.Utils.pointInRect(x, y, bx, 280, bw, 50)) return 'play';
            if (S.Utils.pointInRect(x, y, bx, 340, bw, 50)) return 'howtoplay';
            if (S.Utils.pointInRect(x, y, bx, 400, bw, 50)) return 'credits';
            return null;
        },

        // ---- Map Select ----
        renderMapSelect: function(ctx, saveData) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.fillRect(0, 0, W, H);

            // Title
            ctx.fillStyle = C.NEON_CYAN;
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SELECT MAP', W / 2, 60);

            // Map cards
            var maps = S.data.mapOrder;
            var cardW = 250;
            var cardH = 300;
            var gap = 30;
            var startX = (W - (maps.length * cardW + (maps.length - 1) * gap)) / 2;

            for (var i = 0; i < maps.length; i++) {
                var mapId = maps[i];
                var mapData = S.data.maps[mapId];
                var unlocked = S.SaveSystem.isMapUnlocked(mapId);
                var stars = S.SaveSystem.getBestStars(mapId);
                var cx = startX + i * (cardW + gap);
                var cy = 110;

                // Card
                ctx.fillStyle = unlocked ? C.DARK_SLATE : '#111118';
                ctx.fillRect(cx, cy, cardW, cardH);
                ctx.strokeStyle = unlocked ? C.STEEL_BLUE : '#222222';
                ctx.lineWidth = 2;
                ctx.strokeRect(cx, cy, cardW, cardH);

                if (!unlocked) {
                    // Lock icon
                    ctx.fillStyle = '#333333';
                    ctx.font = '48px Arial';
                    ctx.fillText('🔒', cx + cardW / 2, cy + 120);
                    ctx.fillStyle = '#555555';
                    ctx.font = '14px Arial';
                    ctx.fillText('Clear ' + S.data.maps[maps[i - 1]].name, cx + cardW / 2, cy + 200);
                    continue;
                }

                // Map thumbnail (grid preview)
                var grid = mapData.grid;
                var previewCellSize = Math.min(200 / mapData.cols, 140 / mapData.rows);
                var gridW = mapData.cols * previewCellSize;
                var gridH = mapData.rows * previewCellSize;
                var gx = cx + (cardW - gridW) / 2;
                var gy = cy + 20;

                for (var r = 0; r < mapData.rows; r++) {
                    for (var c = 0; c < mapData.cols; c++) {
                        var cell = grid[r][c];
                        ctx.fillStyle = cell === 0 ? mapData.theme.ground :
                                       cell === 1 ? mapData.theme.path :
                                       cell === 2 ? '#6a3a3a' : '#3a6a3a';
                        ctx.fillRect(gx + c * previewCellSize, gy + r * previewCellSize, previewCellSize, previewCellSize);
                    }
                }

                // Map name
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(mapData.name, cx + cardW / 2, cy + 190);

                // Difficulty dots
                var diffDots = mapData.difficulty;
                ctx.fillStyle = '#666666';
                ctx.font = '12px Arial';
                ctx.fillText('Difficulty: ' + '★'.repeat(diffDots) + '☆'.repeat(3 - diffDots), cx + cardW / 2, cy + 215);

                // Stars
                var starStr = '';
                for (var si = 0; si < 3; si++) {
                    starStr += si < stars ? '★' : '☆';
                }
                ctx.fillStyle = stars > 0 ? C.GOLD_YELLOW : '#444444';
                ctx.font = '24px Arial';
                ctx.fillText(starStr, cx + cardW / 2, cy + 255);
            }

            // Back button
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(20, H - 60, 100, 40);
            ctx.strokeStyle = C.SLATE_GRAY;
            ctx.lineWidth = 1;
            ctx.strokeRect(20, H - 60, 100, 40);
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px Arial';
            ctx.fillText('← Back', 70, H - 40);
        },

        handleMapSelectClick: function(x, y, saveData) {
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;
            var maps = S.data.mapOrder;
            var cardW = 250;
            var gap = 30;
            var startX = (W - (maps.length * cardW + (maps.length - 1) * gap)) / 2;

            for (var i = 0; i < maps.length; i++) {
                var cx = startX + i * (cardW + gap);
                var unlocked = S.SaveSystem.isMapUnlocked(maps[i]);
                if (unlocked && S.Utils.pointInRect(x, y, cx, 110, cardW, 300)) {
                    return maps[i];
                }
            }

            // Back button
            if (S.Utils.pointInRect(x, y, 20, H - 60, 100, 40)) return 'back';
            return null;
        },

        // ---- Difficulty Select ----
        renderDifficultySelect: function(ctx, mapId) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;
            var mapData = S.data.maps[mapId];

            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle = C.NEON_CYAN;
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mapData.name, W / 2, 50);

            ctx.fillStyle = '#888888';
            ctx.font = '16px Arial';
            ctx.fillText('Select Difficulty', W / 2, 85);

            var diffs = ['easy', 'normal', 'hard'];
            var labels = ['EASY', 'NORMAL', 'HARD'];
            var colors = [C.ELECTRIC_GREEN, C.NEON_CYAN, C.DANGER_RED];
            var cardW = 220;
            var cardH = 250;
            var gap = 30;
            var startX = (W - (3 * cardW + 2 * gap)) / 2;

            for (var i = 0; i < 3; i++) {
                var diff = diffs[i];
                var d = S.DIFFICULTY[diff];
                var cx = startX + i * (cardW + gap);
                var cy = 120;

                ctx.fillStyle = C.DARK_SLATE;
                ctx.fillRect(cx, cy, cardW, cardH);
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = 2;
                ctx.strokeRect(cx, cy, cardW, cardH);

                // Title
                ctx.fillStyle = colors[i];
                ctx.font = 'bold 22px Arial';
                ctx.fillText(labels[i], cx + cardW / 2, cy + 35);

                // Stats
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '13px Arial';
                var statsY = cy + 65;
                var lines = [
                    'Gold: ' + d.gold + 'G',
                    'Lives: ' + d.lives,
                    'Enemy HP: x' + d.hpMult,
                    'Enemy Speed: x' + d.spdMult,
                    'Rewards: x' + d.rewardMult,
                    'Interest: ' + Math.round(d.interest * 100) + '%'
                ];
                for (var j = 0; j < lines.length; j++) {
                    ctx.fillText(lines[j], cx + cardW / 2, statsY + j * 22);
                }

                // Play button
                ctx.fillStyle = '#1a2233';
                ctx.fillRect(cx + 30, cy + cardH - 50, cardW - 60, 36);
                ctx.strokeStyle = colors[i];
                ctx.lineWidth = 1.5;
                ctx.strokeRect(cx + 30, cy + cardH - 50, cardW - 60, 36);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText('PLAY', cx + cardW / 2, cy + cardH - 32);
            }

            // Hero selection
            ctx.fillStyle = '#888888';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('Hero: Commander Kael (auto-selected)', W / 2, 405);

            // Back button
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(20, H - 60, 100, 40);
            ctx.strokeStyle = C.SLATE_GRAY;
            ctx.lineWidth = 1;
            ctx.strokeRect(20, H - 60, 100, 40);
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '14px Arial';
            ctx.fillText('← Back', 70, H - 40);
        },

        handleDifficultySelectClick: function(x, y) {
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;
            var cardW = 220;
            var cardH = 250;
            var gap = 30;
            var startX = (W - (3 * cardW + 2 * gap)) / 2;
            var diffs = ['easy', 'normal', 'hard'];

            for (var i = 0; i < 3; i++) {
                var cx = startX + i * (cardW + gap);
                if (S.Utils.pointInRect(x, y, cx, 120, cardW, cardH)) {
                    return diffs[i];
                }
            }

            if (S.Utils.pointInRect(x, y, 20, H - 60, 100, 40)) return 'back';
            return null;
        },

        // ---- How to Play ----
        renderHowToPlay: function(ctx) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle = C.NEON_CYAN;
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('HOW TO PLAY', W / 2, 30);

            ctx.fillStyle = '#cccccc';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            var y = 80;
            var lines = [
                '🏰 Place towers on empty cells to defend against waves of enemies.',
                '💰 Earn gold by defeating enemies and completing waves.',
                '⬆ Upgrade towers to increase their power (4 tiers each).',
                '💫 Place specific tower combos for synergy bonuses!',
                '',
                '🎮 Controls:',
                '  • Left-click sidebar tower → click grid to place',
                '  • Left-click placed tower → view info / upgrade / sell',
                '  • Right-click game board → move hero',
                '  • Q → activate hero ability',
                '  • ESC → pause game',
                '  • 1/2/3 → game speed',
                '',
                '⭐ Stars:',
                '  ★☆☆ = Clear the map',
                '  ★★☆ = Clear with 50%+ lives remaining',
                '  ★★★ = Perfect clear (no lives lost)',
            ];

            for (var i = 0; i < lines.length; i++) {
                ctx.fillText(lines[i], 100, y + i * 24);
            }

            // Back button
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(W / 2 - 60, H - 60, 120, 40);
            ctx.strokeStyle = C.NEON_CYAN;
            ctx.lineWidth = 1;
            ctx.strokeRect(W / 2 - 60, H - 60, 120, 40);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('← Back', W / 2, H - 40);
        },

        // ---- Credits ----
        renderCredits: function(ctx) {
            var C = S.COLORS;
            var W = S.CANVAS_WIDTH;
            var H = S.CANVAS_HEIGHT;

            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle = C.NEON_CYAN;
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('CREDITS', W / 2, 80);

            ctx.fillStyle = '#cccccc';
            ctx.font = '16px Arial';
            ctx.fillText('Sentinel: Tower Defense', W / 2, 160);
            ctx.fillText('Built by Tycono Team', W / 2, 200);
            ctx.fillStyle = '#888888';
            ctx.font = '14px Arial';
            ctx.fillText('Design: Monni (CBO) & Noah (PM) & Joyce (Designer)', W / 2, 260);
            ctx.fillText('Engineering: CoolGuy (Engineer)', W / 2, 290);
            ctx.fillText('Architecture: Su (CTO)', W / 2, 320);
            ctx.fillText('QA: Devin (QA)', W / 2, 350);

            // Back
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(W / 2 - 60, H - 60, 120, 40);
            ctx.strokeStyle = C.NEON_CYAN;
            ctx.lineWidth = 1;
            ctx.strokeRect(W / 2 - 60, H - 60, 120, 40);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('← Back', W / 2, H - 40);
        },

        // ---- Dispatcher ----
        render: function(ctx, game) {
            switch (game.state) {
                case 'menu':
                    this.renderMainMenu(ctx);
                    break;
                case 'mapSelect':
                    this.renderMapSelect(ctx);
                    break;
                case 'difficultySelect':
                    this.renderDifficultySelect(ctx, game.selectedMapId);
                    break;
                case 'howToPlay':
                    this.renderHowToPlay(ctx);
                    break;
                case 'credits':
                    this.renderCredits(ctx);
                    break;
            }
        }
    };
})();
