(function() {
    'use strict';
    var S = window.Sentinel;

    var CARD_WIDTH = 220;
    var CARD_HEIGHT = 48;
    var CARD_MARGIN = 4;
    var CARD_X_OFFSET = 10;
    var SECTION_HEIGHT = 0;

    S.Sidebar = {
        scrollOffset: 0,

        render: function(ctx, game) {
            var C = S.COLORS;
            var px = S.SIDE_PANEL_X;
            var py = S.SIDE_PANEL_Y;
            var pw = S.SIDE_PANEL_WIDTH;
            var ph = S.GAME_BOARD_HEIGHT;

            // Panel background
            ctx.fillStyle = C.DEEP_NIGHT;
            ctx.fillRect(px, py, pw, ph);

            // Left border
            ctx.strokeStyle = C.STEEL_BLUE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px, py + ph);
            ctx.stroke();

            if (game.selectedTower) {
                this.renderTowerInfo(ctx, game, px, py);
            } else {
                this.renderTowerSelection(ctx, game, px, py);
                this.renderHeroPanel(ctx, game, px, py);
                this.renderSynergyPanel(ctx, game, px, py);
                this.renderWavePreview(ctx, game, px, py);
                this.renderControls(ctx, game, px, py);
            }
        },

        renderTowerSelection: function(ctx, game, px, py) {
            var C = S.COLORS;
            var types = S.TOWER_TYPES;
            var startY = py + 6;

            // Title
            ctx.fillStyle = '#888888';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('TOWERS', px + 12, startY);
            startY += 14;

            // 2 columns x 4 rows
            for (var i = 0; i < types.length; i++) {
                var type = types[i];
                var data = S.data.towers[type];
                var cost = data.tiers[0].cost;
                var canAfford = game.gold >= cost;
                var isSelected = game.selectedTowerType === type;
                var col = i % 2;
                var row = Math.floor(i / 2);

                var cardX = px + 6 + col * 117;
                var cardY = startY + row * (CARD_HEIGHT + CARD_MARGIN);
                var cardW = 112;
                var cardH = CARD_HEIGHT;

                // Card background
                if (isSelected) {
                    ctx.fillStyle = C.SLATE_GRAY;
                    ctx.strokeStyle = C.NEON_CYAN;
                    ctx.lineWidth = 2;
                } else if (!canAfford) {
                    ctx.fillStyle = '#111822';
                    ctx.strokeStyle = '#222833';
                    ctx.lineWidth = 1;
                } else {
                    ctx.fillStyle = C.DARK_SLATE;
                    ctx.strokeStyle = C.STEEL_BLUE;
                    ctx.lineWidth = 1;
                }

                ctx.fillRect(cardX, cardY, cardW, cardH);
                ctx.strokeRect(cardX, cardY, cardW, cardH);

                // Tower icon (small)
                ctx.fillStyle = canAfford ? data.color : '#444444';
                ctx.beginPath();
                ctx.arc(cardX + 16, cardY + 18, 8, 0, Math.PI * 2);
                ctx.fill();

                // Name
                ctx.fillStyle = canAfford ? '#ffffff' : '#555555';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(data.name.replace(' Tower', ''), cardX + 28, cardY + 6);

                // Cost
                ctx.fillStyle = canAfford ? C.GOLD_YELLOW : C.DANGER_RED;
                ctx.font = 'bold 10px Arial';
                ctx.fillText(cost + 'G', cardX + 28, cardY + 20);

                // DPS (tiny)
                var tier0 = data.tiers[0];
                if (tier0.damage > 0) {
                    ctx.fillStyle = '#666666';
                    ctx.font = '8px Arial';
                    var dps = (tier0.attackSpeed || 1) * tier0.damage;
                    ctx.fillText('DPS:' + Math.round(dps), cardX + 28, cardY + 34);
                } else if (type === 'amplifier') {
                    ctx.fillStyle = '#666666';
                    ctx.font = '8px Arial';
                    ctx.fillText('ATK+' + Math.round(tier0.atkBuff * 100) + '%', cardX + 28, cardY + 34);
                } else if (type === 'flame') {
                    ctx.fillStyle = '#666666';
                    ctx.font = '8px Arial';
                    ctx.fillText('DPS:' + tier0.damage, cardX + 28, cardY + 34);
                }
            }

            SECTION_HEIGHT = startY + 4 * (CARD_HEIGHT + CARD_MARGIN) - py;
        },

        renderTowerInfo: function(ctx, game, px, py) {
            var C = S.COLORS;
            var tower = game.selectedTower;
            var data = tower.data;
            var td = tower.getTierData();
            var y = py + 10;

            // Title
            ctx.fillStyle = data.color;
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(data.name, px + 12, y);

            ctx.fillStyle = '#aaaaaa';
            ctx.font = '11px Arial';
            ctx.fillText('Tier ' + (tower.tier + 1), px + 12, y + 18);

            y += 38;

            // Stats
            var stats = [
                ['DMG', tower.getEffectiveDamage()],
                ['SPD', tower.getEffectiveAttackSpeed().toFixed(1) + '/s'],
                ['RNG', tower.getEffectiveRange().toFixed(1)]
            ];

            if (tower.type === 'amplifier') {
                stats = [
                    ['ATK+', Math.round(td.atkBuff * 100) + '%'],
                    ['SPD+', Math.round((td.spdBuff || 0) * 100) + '%'],
                    ['RNG', td.range.toFixed(1)]
                ];
            }

            if (tower.type === 'slow') {
                stats.push(['SLOW', Math.round(tower.getSlowFactor() * 100) + '%']);
            }

            if (tower.type === 'tesla') {
                stats.push(['CHAIN', td.chainCount]);
            }

            if (tower.type === 'cannon') {
                stats.push(['SPLASH', tower.getEffectiveSplash().toFixed(1)]);
            }

            for (var i = 0; i < stats.length; i++) {
                ctx.fillStyle = '#888888';
                ctx.font = '10px Arial';
                ctx.fillText(stats[i][0], px + 12, y + i * 16);
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px Arial';
                ctx.fillText(stats[i][1], px + 60, y + i * 16);
            }

            y += stats.length * 16 + 10;

            // Special ability
            if (td.special) {
                ctx.fillStyle = C.NEON_CYAN;
                ctx.font = 'bold 10px Arial';
                ctx.fillText('[' + td.special.toUpperCase() + ']', px + 12, y);
                y += 16;
            }

            // Synergy info
            if (tower.activeSynergies && tower.activeSynergies.length > 0) {
                ctx.fillStyle = C.ELECTRIC_GREEN;
                ctx.font = 'bold 10px Arial';
                for (var s = 0; s < tower.activeSynergies.length; s++) {
                    var synId = tower.activeSynergies[s];
                    for (var si = 0; si < S.SynergySystem.SYNERGIES.length; si++) {
                        if (S.SynergySystem.SYNERGIES[si].id === synId) {
                            ctx.fillText('★ ' + S.SynergySystem.SYNERGIES[si].name, px + 12, y);
                            y += 14;
                        }
                    }
                }
            }

            y += 10;

            // Upgrade button
            if (tower.canUpgrade()) {
                var upgCost = tower.getUpgradeCost();
                var canUpg = game.gold >= upgCost;

                ctx.fillStyle = canUpg ? '#1a3322' : '#221a1a';
                ctx.fillRect(px + 10, y, 220, 36);
                ctx.strokeStyle = canUpg ? C.ELECTRIC_GREEN : C.DANGER_RED;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(px + 10, y, 220, 36);

                ctx.fillStyle = canUpg ? '#ffffff' : '#666666';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Upgrade (' + upgCost + 'G)', px + 120, y + 18);
                ctx.textAlign = 'left';
            } else {
                ctx.fillStyle = '#333333';
                ctx.fillRect(px + 10, y, 220, 36);
                ctx.fillStyle = '#666666';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('MAX TIER', px + 120, y + 18);
                ctx.textAlign = 'left';
            }
            y += 44;

            // Sell button
            var sellPrice = tower.getSellPrice();
            ctx.fillStyle = '#2a1a1a';
            ctx.fillRect(px + 10, y, 220, 36);
            ctx.strokeStyle = C.WARNING_ORANGE;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 10, y, 220, 36);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Sell (' + sellPrice + 'G)', px + 120, y + 18);
            ctx.textAlign = 'left';

            y += 44;

            // Deselect button
            ctx.fillStyle = C.DARK_SLATE;
            ctx.fillRect(px + 10, y, 220, 30);
            ctx.strokeStyle = C.SLATE_GRAY;
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 10, y, 220, 30);

            ctx.fillStyle = '#aaaaaa';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Close [ESC]', px + 120, y + 15);
            ctx.textAlign = 'left';
        },

        renderHeroPanel: function(ctx, game, px, py) {
            if (!game.hero) return;
            var C = S.COLORS;
            var hero = game.hero;
            var y = py + SECTION_HEIGHT + 8;

            // Section header
            ctx.fillStyle = '#888888';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('HERO', px + 12, y);
            y += 14;

            // Hero name
            ctx.fillStyle = hero.color;
            ctx.font = 'bold 11px Arial';
            ctx.fillText(hero.name, px + 12, y);
            y += 16;

            // Active ability button
            var canUse = hero.activeCooldown <= 0 && !hero.activeActive;
            ctx.fillStyle = canUse ? '#1a2233' : '#161616';
            ctx.fillRect(px + 10, y, 220, 30);
            ctx.strokeStyle = canUse ? C.NEON_CYAN : '#333333';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 10, y, 220, 30);

            if (hero.activeActive) {
                ctx.fillStyle = C.NEON_CYAN;
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('⚔ ACTIVE! ' + Math.ceil(hero.activeTimer) + 's', px + 120, y + 15);
            } else if (hero.activeCooldown > 0) {
                ctx.fillStyle = '#666666';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(hero.active.name + ' (CD: ' + Math.ceil(hero.activeCooldown) + 's)', px + 120, y + 15);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('⚔ ' + hero.active.name + ' [Q]', px + 120, y + 15);
            }
            ctx.textAlign = 'left';

            SECTION_HEIGHT += 70;
        },

        renderSynergyPanel: function(ctx, game, px, py) {
            var C = S.COLORS;
            var y = py + SECTION_HEIGHT + 8;

            ctx.fillStyle = '#888888';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('SYNERGIES', px + 12, y);
            y += 14;

            var synergies = S.SynergySystem.SYNERGIES;
            for (var i = 0; i < synergies.length; i++) {
                var syn = synergies[i];
                var isActive = false;
                if (game.activeSynergies) {
                    for (var j = 0; j < game.activeSynergies.length; j++) {
                        if (game.activeSynergies[j].synergy.id === syn.id) {
                            isActive = true;
                            break;
                        }
                    }
                }

                ctx.fillStyle = isActive ? syn.color : '#333333';
                ctx.font = isActive ? 'bold 9px Arial' : '9px Arial';
                ctx.fillText((isActive ? '★ ' : '  ') + syn.name, px + 12, y + i * 14);
            }

            SECTION_HEIGHT += 14 + synergies.length * 14;
        },

        renderWavePreview: function(ctx, game, px, py) {
            var C = S.COLORS;
            var preview = game.waveManager.getNextWavePreview();
            var y = py + SECTION_HEIGHT + 8;

            ctx.fillStyle = '#888888';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('NEXT WAVE', px + 12, y);
            y += 14;

            if (!preview) {
                ctx.fillStyle = '#555555';
                ctx.font = '9px Arial';
                ctx.fillText('Final wave cleared!', px + 12, y);
                SECTION_HEIGHT += 28;
                return;
            }

            var types = Object.keys(preview);
            for (var i = 0; i < types.length; i++) {
                var type = types[i];
                var eData = S.data.enemies[type];
                if (!eData) continue;

                ctx.fillStyle = eData.color;
                ctx.beginPath();
                ctx.arc(px + 20, y + i * 13 + 4, 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#aaaaaa';
                ctx.font = '9px Arial';
                ctx.fillText(eData.name + ' x' + preview[type], px + 28, y + i * 13);
            }

            SECTION_HEIGHT += 14 + types.length * 13;
        },

        renderControls: function(ctx, game, px, py) {
            var C = S.COLORS;
            var y = py + S.GAME_BOARD_HEIGHT - 46;

            // Start wave button
            var canStart = !game.waveManager.waveInProgress && game.waveManager.currentWave < game.waveManager.totalWaves;
            ctx.fillStyle = canStart ? '#1a2a1a' : C.DARK_SLATE;
            ctx.fillRect(px + 10, y, 220, 36);
            ctx.strokeStyle = canStart ? C.ELECTRIC_GREEN : '#333333';
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 10, y, 220, 36);

            ctx.fillStyle = canStart ? '#ffffff' : '#555555';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                game.waveManager.waveInProgress ? 'Wave in progress...' : '▶ START WAVE',
                px + 120, y + 18
            );
            ctx.textAlign = 'left';
        },

        // Handle sidebar clicks
        handleClick: function(x, y, game) {
            var px = S.SIDE_PANEL_X;
            var py = S.SIDE_PANEL_Y;

            // If tower info panel is showing
            if (game.selectedTower) {
                return this.handleTowerInfoClick(x, y, game);
            }

            // Tower selection (2x4 grid)
            var startY = py + 20;
            var types = S.TOWER_TYPES;
            for (var i = 0; i < types.length; i++) {
                var col = i % 2;
                var row = Math.floor(i / 2);
                var cardX = px + 6 + col * 117;
                var cardY = startY + row * (CARD_HEIGHT + CARD_MARGIN);

                if (S.Utils.pointInRect(x, y, cardX, cardY, 112, CARD_HEIGHT)) {
                    var type = types[i];
                    var cost = S.data.towers[type].tiers[0].cost;
                    if (game.gold >= cost) {
                        game.selectTowerType(type);
                        if (S.audio) S.audio.playUIClick();
                    } else {
                        if (S.audio) S.audio.playError();
                    }
                    return true;
                }
            }

            // Hero active ability button
            if (game.hero) {
                var heroY = py + SECTION_HEIGHT - 70 + 38; // approximate
                // Rough hit test for hero ability button
                if (S.Utils.pointInRect(x, y, px + 10, heroY, 220, 30)) {
                    game.hero.useActive(game);
                    return true;
                }
            }

            // Start wave button
            var waveY = py + S.GAME_BOARD_HEIGHT - 46;
            if (S.Utils.pointInRect(x, y, px + 10, waveY, 220, 36)) {
                if (!game.waveManager.waveInProgress) {
                    game.startNextWave();
                    if (S.audio) S.audio.playUIClick();
                }
                return true;
            }

            return false;
        },

        handleTowerInfoClick: function(x, y, game) {
            var px = S.SIDE_PANEL_X;
            var py = S.SIDE_PANEL_Y;
            var tower = game.selectedTower;

            // Calculate button positions (must match render)
            var td = tower.getTierData();
            var statsCount = 3;
            if (tower.type === 'slow' || tower.type === 'tesla' || tower.type === 'cannon') statsCount = 4;
            var baseY = py + 48 + statsCount * 16 + 10;
            if (td.special) baseY += 16;
            if (tower.activeSynergies && tower.activeSynergies.length > 0) {
                baseY += tower.activeSynergies.length * 14;
            }
            baseY += 10;

            // Upgrade button
            if (tower.canUpgrade()) {
                if (S.Utils.pointInRect(x, y, px + 10, baseY, 220, 36)) {
                    var cost = tower.getUpgradeCost();
                    if (game.gold >= cost) {
                        game.upgradeTower(tower);
                    }
                    return true;
                }
                baseY += 44;
            } else {
                baseY += 44;
            }

            // Sell button
            if (S.Utils.pointInRect(x, y, px + 10, baseY, 220, 36)) {
                game.sellTower(tower);
                return true;
            }
            baseY += 44;

            // Deselect button
            if (S.Utils.pointInRect(x, y, px + 10, baseY, 220, 30)) {
                game.selectedTower = null;
                return true;
            }

            return false;
        }
    };
})();
