(function() {
    'use strict';
    var S = window.Sentinel;

    S.Renderer = {
        canvas: null,
        ctx: null,

        init: function(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            canvas.width = S.CANVAS_WIDTH;
            canvas.height = S.CANVAS_HEIGHT;
        },

        clear: function() {
            var ctx = this.ctx;
            ctx.fillStyle = S.COLORS.DEEP_NIGHT;
            ctx.fillRect(0, 0, S.CANVAS_WIDTH, S.CANVAS_HEIGHT);
        },

        renderGame: function(game) {
            var ctx = this.ctx;

            this.clear();

            // Game board background
            this.renderBoard(game);

            // Grid
            this.renderGrid(game);

            // Tower ranges (if placing or selected)
            this.renderRangeIndicators(game);

            // Synergy lines
            this.renderSynergyLines(game);

            // Towers
            for (var i = 0; i < game.towers.length; i++) {
                game.towers[i].render(ctx, game);
            }

            // Enemies
            for (var i = 0; i < game.enemies.length; i++) {
                if (!game.enemies[i].isDead && !game.enemies[i].reachedEnd) {
                    game.enemies[i].render(ctx, game);
                }
            }

            // Projectiles
            for (var i = 0; i < game.projectiles.length; i++) {
                game.projectiles[i].render(ctx);
            }

            // Hero
            if (game.hero) {
                game.hero.render(ctx, game);
            }

            // Particles
            game.particles.render(ctx);

            // Effects (gold popups, wave complete, boss warning, etc.)
            S.Effects.render(ctx);

            // HUD
            S.HUD.render(ctx, game);

            // Side panel
            S.Sidebar.render(ctx, game);

            // Placement ghost
            if (game.placingTower && game.mouseCell) {
                this.renderPlacementGhost(game);
            }
        },

        renderBoard: function(game) {
            var ctx = this.ctx;
            var map = game.mapData;
            var cs = map.cellSize;
            var ox = map.offsetX;
            var oy = map.offsetY;

            // Board background
            ctx.fillStyle = S.COLORS.DARKER_SLATE;
            ctx.fillRect(S.GAME_BOARD_X, S.GAME_BOARD_Y, S.GAME_BOARD_WIDTH, S.GAME_BOARD_HEIGHT);

            // Draw path tiles
            var grid = map.grid;
            for (var r = 0; r < grid.length; r++) {
                for (var c = 0; c < grid[r].length; c++) {
                    var cell = grid[r][c];
                    var px = ox + c * cs;
                    var py = oy + r * cs;

                    if (cell === 1) {
                        // Path
                        ctx.fillStyle = map.theme ? map.theme.path || '#2a2a3a' : '#2a2a3a';
                        ctx.fillRect(px, py, cs, cs);
                    } else if (cell === 2) {
                        // Start
                        ctx.fillStyle = '#1a3a1a';
                        ctx.fillRect(px, py, cs, cs);
                        ctx.fillStyle = S.COLORS.ELECTRIC_GREEN;
                        ctx.font = 'bold 10px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('IN', px + cs / 2, py + cs / 2);
                    } else if (cell === 3) {
                        // End
                        ctx.fillStyle = '#3a1a1a';
                        ctx.fillRect(px, py, cs, cs);
                        ctx.fillStyle = S.COLORS.DANGER_RED;
                        ctx.font = 'bold 10px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('OUT', px + cs / 2, py + cs / 2);
                    }
                }
            }
        },

        renderGrid: function(game) {
            var ctx = this.ctx;
            var map = game.mapData;
            var cs = map.cellSize;
            var ox = map.offsetX;
            var oy = map.offsetY;
            var grid = map.grid;

            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 0.5;

            for (var r = 0; r <= grid.length; r++) {
                ctx.beginPath();
                ctx.moveTo(ox, oy + r * cs);
                ctx.lineTo(ox + grid[0].length * cs, oy + r * cs);
                ctx.stroke();
            }
            for (var c = 0; c <= grid[0].length; c++) {
                ctx.beginPath();
                ctx.moveTo(ox + c * cs, oy);
                ctx.lineTo(ox + c * cs, oy + grid.length * cs);
                ctx.stroke();
            }
        },

        renderRangeIndicators: function(game) {
            var ctx = this.ctx;

            // Selected tower range
            if (game.selectedTower) {
                var t = game.selectedTower;
                var range = t.getEffectiveRange() * game.mapData.cellSize;
                ctx.strokeStyle = S.Utils.colorAlpha(t.color, 0.3);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = S.Utils.colorAlpha(t.color, 0.05);
                ctx.fill();
            }

            // Placing tower range preview
            if (game.placingTower && game.mouseCell) {
                var towerData = S.data.towers[game.placingTower];
                var range = towerData.tiers[1].range * game.mapData.cellSize;
                var pos = S.Utils.cellToPixel(game.mouseCell.col, game.mouseCell.row, game.mapData);
                ctx.strokeStyle = S.Utils.colorAlpha(towerData.color, 0.3);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, range, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = S.Utils.colorAlpha(towerData.color, 0.05);
                ctx.fill();
            }
        },

        renderSynergyLines: function(game) {
            if (!game.activeSynergies || game.activeSynergies.length === 0) return;
            var ctx = this.ctx;

            for (var i = 0; i < game.activeSynergies.length; i++) {
                var syn = game.activeSynergies[i];
                var towers = syn.towers;
                if (!towers || towers.length < 2) continue;

                var synDef = S.data.synergies[syn.id];
                var color = synDef ? synDef.color : '#ffffff';

                ctx.strokeStyle = S.Utils.colorAlpha(color, 0.15);
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);

                for (var j = 0; j < towers.length; j++) {
                    for (var k = j + 1; k < towers.length; k++) {
                        ctx.beginPath();
                        ctx.moveTo(towers[j].x, towers[j].y);
                        ctx.lineTo(towers[k].x, towers[k].y);
                        ctx.stroke();
                    }
                }
                ctx.setLineDash([]);
            }
        },

        renderPlacementGhost: function(game) {
            var ctx = this.ctx;
            var cell = game.mouseCell;
            var map = game.mapData;
            var cs = map.cellSize;
            var grid = map.grid;

            // Check if placement is valid
            var canPlace = cell.row >= 0 && cell.row < grid.length &&
                           cell.col >= 0 && cell.col < grid[0].length &&
                           grid[cell.row][cell.col] === 0 &&
                           !game.getTowerAt(cell.col, cell.row);

            var pos = S.Utils.cellToPixel(cell.col, cell.row, map);

            // Cell highlight
            ctx.fillStyle = canPlace ? 'rgba(0,217,255,0.15)' : 'rgba(255,50,50,0.2)';
            ctx.fillRect(pos.x - cs / 2, pos.y - cs / 2, cs, cs);

            ctx.strokeStyle = canPlace ? S.COLORS.NEON_CYAN : S.COLORS.DANGER_RED;
            ctx.lineWidth = 1;
            ctx.strokeRect(pos.x - cs / 2, pos.y - cs / 2, cs, cs);

            // Ghost tower
            if (canPlace) {
                var towerData = S.data.towers[game.placingTower];
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = towerData.color;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, cs * 0.3, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        },

        renderMenu: function(game) {
            this.clear();
            S.Menu.render(this.ctx, game);
        }
    };
})();
