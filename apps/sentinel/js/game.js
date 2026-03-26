// Sentinel - Game Class

(function() {
    'use strict';

    class Game {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');

            // 게임 상태
            this.gold = Sentinel.config.initialGold;
            this.lives = Sentinel.config.initialLives;
            this.speed = 1;
            this.isPaused = false;
            this.isGameOver = false;
            this.isVictory = false;

            // 컬렉션
            this.towers = [];
            this.enemies = [];
            this.projectiles = [];
            this.effects = [];

            // UI 상태
            this.selectedTower = null;
            this.selectedTowerType = null;
            this.hoverCell = null;
            this.goldPopups = [];

            // 통계
            this.stats = {
                enemiesKilled: 0,
                towersBuilt: 0,
                totalDamage: 0,
                goldEarned: 0
            };

            // 디버그
            this.debugMode = false;

            this.init();
        }

        init() {
            console.log('[Game] Initialized');
        }

        update(dt) {
            // 웨이브 매니저
            Sentinel.managers.wave.update(dt);

            // 타워
            this.towers.forEach(tower => tower.update(dt, this.enemies));

            // 투사체
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const proj = this.projectiles[i];
                proj.update(dt);
                if (!proj.active) {
                    this.projectiles.splice(i, 1);
                }
            }

            // 적
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const enemy = this.enemies[i];
                enemy.update(dt);

                if (!enemy.active) {
                    if (enemy.reached) {
                        // 베이스 도달
                        this.lives--;
                        if (this.lives <= 0) {
                            this.gameOver();
                        }
                    } else {
                        // 처치됨
                        this.gold += enemy.reward;
                        this.stats.enemiesKilled++;
                        this.stats.goldEarned += enemy.reward;
                        this.addGoldPopup(enemy.x, enemy.y, enemy.reward);
                        Sentinel.managers.audio.playEnemyDeath();
                    }
                    this.enemies.splice(i, 1);
                }
            }

            // 이펙트
            for (let i = this.effects.length - 1; i >= 0; i--) {
                const effect = this.effects[i];
                effect.elapsed += dt;
                if (effect.elapsed >= effect.duration) {
                    this.effects.splice(i, 1);
                }
            }

            // 골드 팝업
            for (let i = this.goldPopups.length - 1; i >= 0; i--) {
                const popup = this.goldPopups[i];
                popup.elapsed += dt;
                popup.y -= 30 * dt;
                popup.alpha = 1 - (popup.elapsed / popup.duration);
                if (popup.elapsed >= popup.duration) {
                    this.goldPopups.splice(i, 1);
                }
            }

            // 웨이브 완료 체크
            if (Sentinel.managers.wave.isWaveComplete() && !Sentinel.managers.wave.isCountingDown) {
                if (Sentinel.managers.wave.hasNextWave()) {
                    // 웨이브 보너스
                    const bonus = Sentinel.managers.wave.getCurrentWaveBonus();
                    this.gold += bonus;
                    this.stats.goldEarned += bonus;

                    // 다음 웨이브 카운트다운 (3초)
                    Sentinel.managers.wave.startCountdown(3);
                } else {
                    // 승리!
                    this.victory();
                }
            }
        }

        render() {
            const ctx = this.ctx;
            const config = Sentinel.config;
            const colors = Sentinel.colors;

            // 배경
            ctx.fillStyle = colors.deepNight;
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 게임 보드
            ctx.save();
            ctx.translate(0, config.hudHeight);
            this.renderGameBoard();
            ctx.restore();

            // UI
            this.renderTopBar();
            this.renderSidebar();
            this.renderBottomBar();

            // 게임 오버/승리 화면
            if (this.isGameOver) {
                this.renderGameOver();
            } else if (this.isVictory) {
                this.renderVictory();
            }
        }

        renderGameBoard() {
            const ctx = this.ctx;

            // 맵
            Sentinel.managers.path.render(ctx);

            // 호버 셀 (타워 배치 시)
            if (this.selectedTowerType && this.hoverCell) {
                const cellSize = Sentinel.config.cellSize;
                const canPlace = Sentinel.managers.path.canPlaceTower(this.hoverCell.gridX, this.hoverCell.gridY);
                const towerData = Sentinel.data.towers[this.selectedTowerType];
                const canAfford = this.gold >= towerData.baseCost;

                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = canPlace && canAfford ? '#00ff00' : '#ff0000';
                ctx.fillRect(
                    this.hoverCell.gridX * cellSize,
                    this.hoverCell.gridY * cellSize,
                    cellSize,
                    cellSize
                );
                ctx.restore();

                // 사거리 미리보기
                if (canPlace && canAfford) {
                    const pos = Sentinel.utils.gridToWorld(this.hoverCell.gridX, this.hoverCell.gridY);
                    const range = towerData.levels[0].range;
                    Sentinel.utils.drawCircle(ctx, pos.x, pos.y, range, towerData.color, 0.3);
                }
            }

            // 타워
            this.towers.forEach(tower => tower.render(ctx));

            // 적
            this.enemies.forEach(enemy => enemy.render(ctx));

            // 투사체
            this.projectiles.forEach(proj => proj.render(ctx));

            // 이펙트
            this.renderEffects();

            // 골드 팝업
            this.renderGoldPopups();
        }

        renderEffects() {
            const ctx = this.ctx;
            const colors = Sentinel.colors;

            this.effects.forEach(effect => {
                if (effect.type === 'explosion' || effect.type === 'heal') {
                    const progress = effect.elapsed / effect.duration;
                    const radius = effect.radius * (0.5 + progress * 0.5);
                    const alpha = effect.alpha * (1 - progress);
                    Sentinel.utils.drawCircle(ctx, effect.x, effect.y, radius, effect.color, alpha);
                } else if (effect.type === 'laser') {
                    // Sniper 레이저
                    const progress = effect.elapsed / effect.duration;
                    const alpha = 1 - progress;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.strokeStyle = effect.color;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = effect.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(effect.x1, effect.y1);
                    ctx.lineTo(effect.x2, effect.y2);
                    ctx.stroke();
                    ctx.restore();
                } else if (effect.type === 'rage' || effect.type === 'boss-warning') {
                    // Boss 분노 / 경고 텍스트
                    const progress = effect.elapsed / effect.duration;
                    const alpha = 1 - progress;
                    const y = effect.y - progress * 30;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = effect.color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = effect.color;
                    ctx.shadowBlur = 15;
                    ctx.fillText(effect.text, effect.x, y);
                    ctx.restore();
                }
            });
        }

        renderGoldPopups() {
            const ctx = this.ctx;
            const colors = Sentinel.colors;

            this.goldPopups.forEach(popup => {
                ctx.save();
                ctx.globalAlpha = popup.alpha;
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = colors.goldYellow;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+' + popup.amount, popup.x, popup.y);
                ctx.restore();
            });
        }

        renderTopBar() {
            const ctx = this.ctx;
            const config = Sentinel.config;
            const colors = Sentinel.colors;

            ctx.fillStyle = colors.steelBlue;
            ctx.fillRect(0, 0, config.canvasWidth, config.hudHeight);

            ctx.strokeStyle = colors.slateGray;
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, config.canvasWidth, config.hudHeight);

            const y = config.hudHeight / 2;

            // 웨이브
            let waveText = 'Wave ' + Sentinel.managers.wave.currentWave + '/' + config.totalWaves;
            if (Sentinel.managers.wave.isCountingDown) {
                waveText += ' (Next in ' + Math.ceil(Sentinel.managers.wave.countdown) + 's)';
            }
            Sentinel.utils.drawText(ctx, waveText, 100, y, 18, colors.neonCyan);

            // 생명
            const livesText = '♥ ' + this.lives;
            Sentinel.utils.drawText(ctx, livesText, 400, y, 18, colors.electricGreen);

            // 골드
            const goldText = '💰 ' + this.gold;
            Sentinel.utils.drawText(ctx, goldText, 780, y, 18, colors.goldYellow);
        }

        renderSidebar() {
            const ctx = this.ctx;
            const config = Sentinel.config;
            const colors = Sentinel.colors;
            const x = config.gameWidth;
            const y = config.hudHeight;
            const w = config.sidebarWidth;
            const h = config.gameHeight;

            // 배경
            ctx.fillStyle = colors.deepNight;
            ctx.fillRect(x, y, w, h);

            ctx.strokeStyle = colors.steelBlue;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);

            // 타워 선택 UI
            const towers = ['arrow', 'cannon', 'slow', 'sniper'];
            towers.forEach((type, index) => {
                const data = Sentinel.data.towers[type];
                const btnX = x + 20;
                const btnY = y + 20 + index * 80;
                const btnW = w - 40;
                const btnH = 65;

                const canAfford = this.gold >= data.baseCost;
                const isSelected = this.selectedTowerType === type;

                // 버튼 배경
                ctx.fillStyle = isSelected ? colors.slateGray : colors.steelBlue;
                ctx.fillRect(btnX, btnY, btnW, btnH);

                ctx.strokeStyle = isSelected ? data.color : colors.slateGray;
                ctx.lineWidth = isSelected ? 3 : 2;
                ctx.strokeRect(btnX, btnY, btnW, btnH);

                // 타워 아이콘 (작은 육각형)
                const iconSize = 20;
                const iconX = btnX + 30;
                const iconY = btnY + btnH / 2;
                ctx.save();
                ctx.fillStyle = data.color;
                ctx.translate(iconX, iconY);
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i;
                    const px = Math.cos(angle) * iconSize;
                    const py = Math.sin(angle) * iconSize;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                // 텍스트
                ctx.fillStyle = canAfford ? '#ffffff' : '#666666';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(data.name, btnX + 65, btnY + 10);

                ctx.font = '11px Arial';
                ctx.fillText(data.description, btnX + 65, btnY + 30);

                ctx.fillStyle = canAfford ? colors.goldYellow : '#666666';
                ctx.font = 'bold 13px Arial';
                ctx.fillText(data.baseCost + 'G', btnX + 65, btnY + 48);
            });

            // 선택된 타워 정보
            if (this.selectedTower) {
                const tower = this.selectedTower;
                const infoY = y + h - 180;

                ctx.fillStyle = colors.steelBlue;
                ctx.fillRect(x + 10, infoY, w - 20, 170);

                ctx.strokeStyle = colors.slateGray;
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 10, infoY, w - 20, 170);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(tower.data.name, x + w / 2, infoY + 15);

                ctx.font = '12px Arial';
                ctx.textAlign = 'left';
                ctx.fillText('Level: ' + tower.level + '/3', x + 20, infoY + 40);
                ctx.fillText('Damage: ' + tower.stats.damage, x + 20, infoY + 60);
                ctx.fillText('Range: ' + tower.stats.range, x + 20, infoY + 75);
                ctx.fillText('Rate: ' + tower.stats.fireRate.toFixed(1) + 's', x + 20, infoY + 90);

                // 업그레이드 버튼
                if (tower.level < 3) {
                    const upgCost = tower.stats.upgradeCost;
                    const canUpgrade = this.gold >= upgCost;
                    const btnY = infoY + 110;

                    ctx.fillStyle = canUpgrade ? colors.electricGreen : '#555555';
                    ctx.fillRect(x + 20, btnY, w - 40, 25);

                    ctx.strokeStyle = canUpgrade ? colors.electricGreen : '#666666';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 20, btnY, w - 40, 25);

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Upgrade (' + upgCost + 'G)', x + w / 2, btnY + 13);
                } else {
                    ctx.fillStyle = colors.goldYellow;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('MAX LEVEL', x + w / 2, infoY + 120);
                }

                // 판매 버튼
                const sellValue = tower.getSellValue();
                const sellBtnY = infoY + 142;

                ctx.fillStyle = colors.dangerRed;
                ctx.fillRect(x + 20, sellBtnY, w - 40, 25);

                ctx.strokeStyle = colors.dangerRed;
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 20, sellBtnY, w - 40, 25);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Sell (' + sellValue + 'G)', x + w / 2, sellBtnY + 13);
            }
        }

        renderBottomBar() {
            const ctx = this.ctx;
            const config = Sentinel.config;
            const y = config.hudHeight + config.gameHeight;

            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, y, config.canvasWidth, config.bottomBarHeight);

            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, y, config.canvasWidth, config.bottomBarHeight);

            const btnY = y + 15;
            const btnH = 30;

            // Start Wave 버튼
            if (!Sentinel.managers.wave.isSpawning && !Sentinel.managers.wave.isCountingDown) {
                ctx.fillStyle = '#4CAF50';
                ctx.fillRect(20, btnY, 120, btnH);
                ctx.strokeStyle = '#66BB6A';
                ctx.lineWidth = 2;
                ctx.strokeRect(20, btnY, 120, btnH);
                Sentinel.utils.drawText(ctx, '▶ Start Wave', 80, btnY + btnH / 2, 14, '#ffffff');
            }

            // Pause 버튼
            const pauseBtnX = 160;
            ctx.fillStyle = this.isPaused ? '#FF9800' : '#555555';
            ctx.fillRect(pauseBtnX, btnY, 100, btnH);
            ctx.strokeStyle = this.isPaused ? '#FFB74D' : '#666666';
            ctx.lineWidth = 2;
            ctx.strokeRect(pauseBtnX, btnY, 100, btnH);
            Sentinel.utils.drawText(ctx, this.isPaused ? '▶ Resume' : '⏸ Pause', pauseBtnX + 50, btnY + btnH / 2, 14, '#ffffff');

            // Speed 버튼
            const speedBtnX = 280;
            const speeds = ['1x', '2x', '3x'];
            speeds.forEach((label, i) => {
                const isActive = this.speed === (i + 1);
                const x = speedBtnX + i * 60;

                ctx.fillStyle = isActive ? '#2196F3' : '#555555';
                ctx.fillRect(x, btnY, 55, btnH);
                ctx.strokeStyle = isActive ? '#64B5F6' : '#666666';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, btnY, 55, btnH);
                Sentinel.utils.drawText(ctx, label, x + 27, btnY + btnH / 2, 14, '#ffffff');
            });
        }

        renderGameOver() {
            const ctx = this.ctx;
            const config = Sentinel.config;

            // 반투명 오버레이
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 제목
            Sentinel.utils.drawText(ctx, 'GAME OVER', config.canvasWidth / 2, 200, 48, '#ff6b6b');

            // 통계
            const centerX = config.canvasWidth / 2;
            ctx.fillStyle = '#ffffff';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Wave Reached: ' + Sentinel.managers.wave.currentWave, centerX, 280);
            ctx.fillText('Enemies Killed: ' + this.stats.enemiesKilled, centerX, 310);
            ctx.fillText('Towers Built: ' + this.stats.towersBuilt, centerX, 340);
            ctx.fillText('Gold Earned: ' + this.stats.goldEarned, centerX, 370);

            // 재시작 안내
            Sentinel.utils.drawText(ctx, 'Refresh page to restart', centerX, 450, 16, '#aaaaaa');
        }

        renderVictory() {
            const ctx = this.ctx;
            const config = Sentinel.config;

            // 반투명 오버레이
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 제목
            Sentinel.utils.drawText(ctx, 'VICTORY!', config.canvasWidth / 2, 200, 48, '#FFD700');

            // 통계
            const centerX = config.canvasWidth / 2;
            ctx.fillStyle = '#ffffff';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('All waves completed!', centerX, 280);
            ctx.fillText('Enemies Killed: ' + this.stats.enemiesKilled, centerX, 320);
            ctx.fillText('Towers Built: ' + this.stats.towersBuilt, centerX, 350);
            ctx.fillText('Gold Earned: ' + this.stats.goldEarned, centerX, 380);
            ctx.fillText('Final Lives: ' + this.lives, centerX, 410);

            // 재시작 안내
            Sentinel.utils.drawText(ctx, 'Refresh page to play again', centerX, 480, 16, '#aaaaaa');
        }

        placeTower(type, gridX, gridY) {
            const data = Sentinel.data.towers[type];

            if (this.gold < data.baseCost) return false;
            if (!Sentinel.managers.path.canPlaceTower(gridX, gridY)) return false;
            if (this.towers.some(t => t.gridX === gridX && t.gridY === gridY)) return false;

            this.gold -= data.baseCost;
            const tower = new Sentinel.classes.Tower(type, gridX, gridY);
            this.towers.push(tower);
            this.stats.towersBuilt++;

            Sentinel.managers.audio.playTowerPlace();

            console.log('[Game] Tower placed:', type, 'at', gridX, gridY);
            return true;
        }

        selectTower(tower) {
            // 기존 선택 해제
            this.towers.forEach(t => t.selected = false);

            this.selectedTower = tower;
            this.selectedTowerType = null;

            if (tower) {
                tower.selected = true;
            }
        }

        upgradeTower(tower) {
            if (tower.upgrade()) {
                Sentinel.managers.audio.playUpgrade();
                return true;
            }
            return false;
        }

        sellTower(tower) {
            const value = tower.getSellValue();
            this.gold += value;

            const index = this.towers.indexOf(tower);
            if (index !== -1) {
                this.towers.splice(index, 1);
            }

            if (this.selectedTower === tower) {
                this.selectedTower = null;
            }

            Sentinel.managers.audio.playTowerPlace(); // 간단한 사운드
            console.log('[Game] Tower sold for', value);
        }

        startNextWave() {
            if (Sentinel.managers.wave.startWave()) {
                Sentinel.managers.audio.playWaveStart();
            }
        }

        toggleSpeed() {
            this.speed = (this.speed % 3) + 1;
        }

        togglePause() {
            this.isPaused = !this.isPaused;
        }

        gameOver() {
            this.isGameOver = true;
            Sentinel.managers.audio.playGameOver();
            console.log('[Game] Game Over');
        }

        victory() {
            this.isVictory = true;
            Sentinel.managers.audio.playVictory();
            console.log('[Game] Victory!');
        }

        addGoldPopup(x, y, amount) {
            this.goldPopups.push({
                x: x,
                y: y - 20,
                amount: amount,
                alpha: 1,
                duration: 1,
                elapsed: 0
            });
        }
    }

    Sentinel.classes.Game = Game;
    console.log('[Sentinel] Game loaded');
})();
