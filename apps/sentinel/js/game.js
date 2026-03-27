// Sentinel - Game Class (폴리싱 버전)

(function() {
    'use strict';

    class Game {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');

            // 게임 상태 머신
            this.gameState = 'menu'; // 'menu' | 'playing' | 'gameover' | 'victory'

            // 게임 데이터
            this.gold = 0;
            this.lives = 0;
            this.speed = 1;
            this.isPaused = false;

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

            // 카운트다운 비주얼
            this.countdownDisplay = null; // {text, alpha, scale, elapsed, duration}

            // 통계
            this.stats = {
                enemiesKilled: 0,
                towersBuilt: 0,
                totalDamage: 0,
                goldEarned: 0
            };

            // 메뉴 애니메이션
            this.menuTime = 0;

            this.init();
        }

        init() {
            console.log('[Game] Initialized');
        }

        startGame() {
            // 게임 상태 초기화
            this.gold = Sentinel.config.initialGold;
            this.lives = Sentinel.config.initialLives;
            this.speed = 1;
            this.isPaused = false;
            this.towers = [];
            this.enemies = [];
            this.projectiles = [];
            this.effects = [];
            this.goldPopups = [];
            this.selectedTower = null;
            this.selectedTowerType = null;
            this.hoverCell = null;
            this.countdownDisplay = null;
            this.stats = { enemiesKilled: 0, towersBuilt: 0, totalDamage: 0, goldEarned: 0 };

            // 매니저 리셋
            Sentinel.managers.path = new Sentinel.classes.PathManager();
            Sentinel.managers.wave = new Sentinel.classes.WaveManager();

            // BGM 시작
            Sentinel.managers.audio.startBGM();

            this.gameState = 'playing';
            console.log('[Game] Game started!');
        }

        restart() {
            Sentinel.managers.audio.stopBGM();
            this.gameState = 'menu';
        }

        update(dt) {
            if (this.gameState !== 'playing') return;
            if (this.isPaused) return;

            // 웨이브 매니저
            Sentinel.managers.wave.update(dt);

            // 카운트다운 비주얼 업데이트
            if (this.countdownDisplay) {
                this.countdownDisplay.elapsed += dt;
                if (this.countdownDisplay.elapsed >= this.countdownDisplay.duration) {
                    this.countdownDisplay = null;
                }
            }

            // 타워
            this.towers.forEach(function(tower) { tower.update(dt, Sentinel.game.enemies); });

            // 투사체
            for (var i = this.projectiles.length - 1; i >= 0; i--) {
                var proj = this.projectiles[i];
                proj.update(dt);
                if (!proj.active) {
                    this.projectiles.splice(i, 1);
                }
            }

            // 적
            for (var i = this.enemies.length - 1; i >= 0; i--) {
                var enemy = this.enemies[i];
                enemy.update(dt);

                if (!enemy.active) {
                    if (enemy.reached) {
                        this.lives -= (enemy.data.liveDamage || 1);
                        if (this.lives <= 0) {
                            this.lives = 0;
                            this.gameOver();
                        }
                    } else {
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
            for (var i = this.effects.length - 1; i >= 0; i--) {
                var effect = this.effects[i];
                effect.elapsed += dt;
                if (effect.elapsed >= effect.duration) {
                    this.effects.splice(i, 1);
                }
            }

            // 골드 팝업
            for (var i = this.goldPopups.length - 1; i >= 0; i--) {
                var popup = this.goldPopups[i];
                popup.elapsed += dt;
                popup.y -= 30 * dt;
                popup.alpha = 1 - (popup.elapsed / popup.duration);
                if (popup.elapsed >= popup.duration) {
                    this.goldPopups.splice(i, 1);
                }
            }

            // 웨이브 완료 체크
            var wm = Sentinel.managers.wave;
            if (wm.isWaveComplete() && !wm.isCountingDown) {
                if (wm.hasNextWave()) {
                    var bonus = wm.getCurrentWaveBonus();
                    this.gold += bonus;
                    this.stats.goldEarned += bonus;
                    this.addGoldPopup(Sentinel.config.gameWidth / 2, Sentinel.config.gameHeight / 2, bonus);
                    wm.startCountdown(3);
                } else if (this.enemies.length === 0) {
                    this.victory();
                }
            }
        }

        render() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;

            // 배경
            ctx.fillStyle = colors.deepNight;
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            if (this.gameState === 'menu') {
                this.renderMenu();
                return;
            }

            // 게임 보드
            ctx.save();
            ctx.translate(0, config.hudHeight);
            this.renderGameBoard();
            ctx.restore();

            // UI
            this.renderTopBar();
            this.renderSidebar();
            this.renderBottomBar();

            // 카운트다운 오버레이
            this.renderCountdown();

            // 게임 오버/승리 화면
            if (this.gameState === 'gameover') {
                this.renderGameOver();
            } else if (this.gameState === 'victory') {
                this.renderVictory();
            }
        }

        // ═══════════════════════════════════════════════════
        // 메인 메뉴
        // ═══════════════════════════════════════════════════

        renderMenu() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var cx = config.canvasWidth / 2;

            this.menuTime += 0.016;

            // 배경 그라디언트
            var grad = ctx.createLinearGradient(0, 0, 0, config.canvasHeight);
            grad.addColorStop(0, '#0a0e1a');
            grad.addColorStop(1, '#1a2332');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 장식 파티클 (간단한 별)
            ctx.save();
            for (var i = 0; i < 30; i++) {
                var px = ((i * 137.5) % config.canvasWidth);
                var py = ((i * 73.3 + this.menuTime * 10) % config.canvasHeight);
                var alpha = 0.3 + 0.3 * Math.sin(this.menuTime * 2 + i);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(px, py, 2, 2);
            }
            ctx.restore();

            // 타이틀
            ctx.save();
            var titleScale = 1 + Math.sin(this.menuTime * 1.5) * 0.02;
            ctx.translate(cx, 180);
            ctx.scale(titleScale, titleScale);

            // 글로우
            ctx.shadowColor = colors.goldYellow;
            ctx.shadowBlur = 30;
            ctx.font = 'bold 64px Arial';
            ctx.fillStyle = colors.goldYellow;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SENTINEL', 0, 0);
            ctx.shadowBlur = 0;
            ctx.restore();

            // 서브타이틀
            Sentinel.utils.drawText(ctx, 'TOWER DEFENSE', cx, 230, 18, colors.neonCyan);

            // PLAY 버튼
            var btnW = 200;
            var btnH = 50;
            var btnX = cx - btnW / 2;
            var btnY = 310;
            var pulse = 0.8 + 0.2 * Math.sin(this.menuTime * 3);

            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#2a5a2a';
            ctx.strokeStyle = colors.electricGreen;
            ctx.lineWidth = 3;
            this.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.shadowColor = colors.electricGreen;
            ctx.shadowBlur = 15;
            Sentinel.utils.drawText(ctx, '▶  PLAY', cx, btnY + btnH / 2, 24, '#ffffff');
            ctx.restore();

            // 저장 — 버튼 영역 (UI 클릭용)
            this.menuPlayBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

            // 조작법
            var infoY = 420;
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('사이드바에서 타워 선택 → 맵에 클릭하여 배치', cx, infoY);
            ctx.fillText('Start Wave로 웨이브 시작 | 타워 클릭 → 업그레이드/판매', cx, infoY + 22);
            ctx.fillText('우클릭: 선택 취소 | 배속: 1x/2x/3x', cx, infoY + 44);

            // 바닥
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '11px Arial';
            ctx.fillText('Sentinel Tower Defense — Built with Canvas 2D', cx, config.canvasHeight - 20);
        }

        // ═══════════════════════════════════════════════════
        // 게임 보드
        // ═══════════════════════════════════════════════════

        renderGameBoard() {
            var ctx = this.ctx;

            Sentinel.managers.path.render(ctx);

            // 호버 셀
            if (this.selectedTowerType && this.hoverCell) {
                var cellSize = Sentinel.config.cellSize;
                var canPlace = Sentinel.managers.path.canPlaceTower(this.hoverCell.gridX, this.hoverCell.gridY);
                var hasTower = this.towers.some(function(t) {
                    return t.gridX === Sentinel.game.hoverCell.gridX && t.gridY === Sentinel.game.hoverCell.gridY;
                });
                var towerData = Sentinel.data.towers[this.selectedTowerType];
                var canAfford = this.gold >= towerData.baseCost;

                ctx.save();
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = (canPlace && canAfford && !hasTower) ? '#00ff00' : '#ff0000';
                ctx.fillRect(
                    this.hoverCell.gridX * cellSize,
                    this.hoverCell.gridY * cellSize,
                    cellSize, cellSize
                );
                ctx.restore();

                if (canPlace && canAfford && !hasTower) {
                    var pos = Sentinel.utils.gridToWorld(this.hoverCell.gridX, this.hoverCell.gridY);
                    var range = towerData.levels[0].range;
                    Sentinel.utils.drawCircle(ctx, pos.x, pos.y, range, towerData.color, 0.3);
                }
            }

            // 타워
            this.towers.forEach(function(tower) { tower.render(ctx); });

            // 적
            this.enemies.forEach(function(enemy) { enemy.render(ctx); });

            // 투사체
            this.projectiles.forEach(function(proj) { proj.render(ctx); });

            // 이펙트
            this.renderEffects();

            // 골드 팝업
            this.renderGoldPopups();
        }

        renderEffects() {
            var ctx = this.ctx;
            var self = this;

            this.effects.forEach(function(effect) {
                var progress = effect.elapsed / effect.duration;

                if (effect.type === 'explosion' || effect.type === 'heal') {
                    var radius = effect.radius * (0.5 + progress * 0.5);
                    var alpha = effect.alpha * (1 - progress);
                    Sentinel.utils.drawCircle(ctx, effect.x, effect.y, radius, effect.color, alpha);
                } else if (effect.type === 'laser') {
                    var alpha = 1 - progress;
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
                    var alpha = 1 - progress;
                    var y = effect.y - progress * 30;
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
            var ctx = this.ctx;
            var colors = Sentinel.colors;

            this.goldPopups.forEach(function(popup) {
                ctx.save();
                ctx.globalAlpha = popup.alpha;
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = colors.goldYellow;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = colors.goldYellow;
                ctx.shadowBlur = 5;
                ctx.fillText('+' + popup.amount + 'G', popup.x, popup.y);
                ctx.restore();
            });
        }

        // ═══════════════════════════════════════════════════
        // HUD (상단 바)
        // ═══════════════════════════════════════════════════

        renderTopBar() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;

            ctx.fillStyle = colors.steelBlue;
            ctx.fillRect(0, 0, config.canvasWidth, config.hudHeight);
            ctx.strokeStyle = colors.slateGray;
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, config.canvasWidth, config.hudHeight);

            var y = config.hudHeight / 2;
            var wm = Sentinel.managers.wave;

            // 웨이브
            var waveText = 'Wave ' + wm.currentWave + '/' + config.totalWaves;
            Sentinel.utils.drawText(ctx, waveText, 70, y, 18, colors.neonCyan);

            // 웨이브 진행 바
            if (wm.isSpawning || (wm.currentWave > 0 && this.enemies.length > 0)) {
                var barX = 140;
                var barY = y - 6;
                var barW = 120;
                var barH = 12;
                var totalInWave = 0;
                if (wm.currentWave > 0 && wm.currentWave <= Sentinel.data.waves.length) {
                    var wd = Sentinel.data.waves[wm.currentWave - 1];
                    for (var i = 0; i < wd.enemies.length; i++) totalInWave += wd.enemies[i].count;
                }
                var remaining = wm.spawnQueue.length + this.enemies.length;
                var progress = totalInWave > 0 ? 1 - (remaining / totalInWave) : 1;

                ctx.fillStyle = '#333333';
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = colors.neonCyan;
                ctx.fillRect(barX, barY, barW * progress, barH);
                ctx.strokeStyle = '#555555';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barW, barH);
            }

            // 생명
            var livesColor = this.lives > 10 ? colors.electricGreen : (this.lives > 5 ? colors.warningOrange : colors.dangerRed);
            Sentinel.utils.drawText(ctx, '\u2665 ' + this.lives, 400, y, 18, livesColor);

            // 골드
            Sentinel.utils.drawText(ctx, '\u26C1 ' + this.gold + 'G', 560, y, 18, colors.goldYellow);

            // 카운트다운 텍스트 (HUD)
            if (wm.isCountingDown) {
                Sentinel.utils.drawText(ctx, 'Next: ' + Math.ceil(wm.countdown) + 's', 750, y, 14, '#aaaaaa');
            }
        }

        // ═══════════════════════════════════════════════════
        // 사이드바
        // ═══════════════════════════════════════════════════

        renderSidebar() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var x = config.gameWidth;
            var y = config.hudHeight;
            var w = config.sidebarWidth;
            var h = config.gameHeight;

            ctx.fillStyle = colors.deepNight;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = colors.steelBlue;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);

            // 타워 선택 UI
            var towers = ['arrow', 'cannon', 'slow', 'sniper'];
            var self = this;
            towers.forEach(function(type, index) {
                var data = Sentinel.data.towers[type];
                var btnX = x + 10;
                var btnY = y + 10 + index * 75;
                var btnW = w - 20;
                var btnH = 65;

                var canAfford = self.gold >= data.baseCost;
                var isSelected = self.selectedTowerType === type;

                ctx.fillStyle = isSelected ? colors.slateGray : colors.steelBlue;
                ctx.fillRect(btnX, btnY, btnW, btnH);

                ctx.strokeStyle = isSelected ? data.color : colors.slateGray;
                ctx.lineWidth = isSelected ? 3 : 1;
                ctx.strokeRect(btnX, btnY, btnW, btnH);

                // 타워 아이콘 (작은 색상 원)
                Sentinel.utils.fillCircle(ctx, btnX + 25, btnY + btnH / 2, 15, data.color, canAfford ? 1 : 0.4);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(btnX + 25, btnY + btnH / 2, 15, 0, Math.PI * 2);
                ctx.stroke();

                // 텍스트
                ctx.fillStyle = canAfford ? '#ffffff' : '#666666';
                ctx.font = 'bold 13px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(data.name, btnX + 50, btnY + 8);

                ctx.font = '10px Arial';
                ctx.fillStyle = canAfford ? '#aaaaaa' : '#555555';
                ctx.fillText(data.description, btnX + 50, btnY + 26);

                ctx.fillStyle = canAfford ? colors.goldYellow : '#666666';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(data.baseCost + 'G', btnX + 50, btnY + 44);
            });

            // 선택된 타워 정보
            if (this.selectedTower) {
                var tower = this.selectedTower;
                var infoY = y + h - 180;

                ctx.fillStyle = colors.steelBlue;
                ctx.fillRect(x + 10, infoY, w - 20, 170);
                ctx.strokeStyle = tower.data.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 10, infoY, w - 20, 170);

                ctx.fillStyle = tower.data.color;
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(tower.data.name, x + w / 2, infoY + 18);

                ctx.font = '12px Arial';
                ctx.textAlign = 'left';
                ctx.fillStyle = '#cccccc';
                ctx.fillText('Level: ' + tower.level + '/3', x + 20, infoY + 40);
                ctx.fillText('Damage: ' + tower.stats.damage, x + 20, infoY + 58);
                ctx.fillText('Range: ' + Math.round(tower.stats.range), x + 20, infoY + 73);
                ctx.fillText('Rate: ' + tower.stats.fireRate.toFixed(2) + 's', x + 20, infoY + 88);

                // 업그레이드 버튼
                if (tower.level < 3) {
                    var upgCost = tower.stats.upgradeCost;
                    var canUpgrade = this.gold >= upgCost;
                    var ubtnY = infoY + 105;

                    ctx.fillStyle = canUpgrade ? '#2a5a2a' : '#333333';
                    ctx.fillRect(x + 20, ubtnY, w - 40, 25);
                    ctx.strokeStyle = canUpgrade ? colors.electricGreen : '#555555';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 20, ubtnY, w - 40, 25);

                    ctx.fillStyle = canUpgrade ? '#ffffff' : '#666666';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('Upgrade (' + upgCost + 'G)', x + w / 2, ubtnY + 13);
                } else {
                    ctx.fillStyle = colors.goldYellow;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('★ MAX LEVEL ★', x + w / 2, infoY + 118);
                }

                // 판매 버튼
                var sellValue = tower.getSellValue();
                var sbtnY = infoY + 140;

                ctx.fillStyle = '#5a2a2a';
                ctx.fillRect(x + 20, sbtnY, w - 40, 25);
                ctx.strokeStyle = colors.dangerRed;
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 20, sbtnY, w - 40, 25);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Sell (' + sellValue + 'G)', x + w / 2, sbtnY + 13);
            }
        }

        // ═══════════════════════════════════════════════════
        // 하단 바
        // ═══════════════════════════════════════════════════

        renderBottomBar() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var y = config.hudHeight + config.gameHeight;

            ctx.fillStyle = '#151520';
            ctx.fillRect(0, y, config.canvasWidth, config.bottomBarHeight);
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, y, config.canvasWidth, config.bottomBarHeight);

            var btnY = y + 10;
            var btnH = 30;
            var wm = Sentinel.managers.wave;

            // Start Wave 버튼
            if (!wm.isSpawning && !wm.isCountingDown && wm.hasNextWave()) {
                ctx.fillStyle = '#2a5a2a';
                ctx.fillRect(20, btnY, 130, btnH);
                ctx.strokeStyle = colors.electricGreen;
                ctx.lineWidth = 2;
                ctx.strokeRect(20, btnY, 130, btnH);
                Sentinel.utils.drawText(ctx, '▶ Start Wave', 85, btnY + btnH / 2, 14, '#ffffff');
            } else if (wm.isSpawning) {
                ctx.fillStyle = '#333333';
                ctx.fillRect(20, btnY, 130, btnH);
                Sentinel.utils.drawText(ctx, 'Wave Active...', 85, btnY + btnH / 2, 13, '#888888');
            }

            // Pause 버튼
            var pauseX = 170;
            ctx.fillStyle = this.isPaused ? '#5a4a0a' : '#333333';
            ctx.fillRect(pauseX, btnY, 100, btnH);
            ctx.strokeStyle = this.isPaused ? colors.warningOrange : '#555555';
            ctx.lineWidth = 1;
            ctx.strokeRect(pauseX, btnY, 100, btnH);
            Sentinel.utils.drawText(ctx, this.isPaused ? '▶ Resume' : '⏸ Pause', pauseX + 50, btnY + btnH / 2, 13, '#ffffff');

            // Speed 버튼
            var speedX = 290;
            for (var i = 0; i < 3; i++) {
                var isActive = this.speed === (i + 1);
                var bx = speedX + i * 55;
                ctx.fillStyle = isActive ? '#0a3a5a' : '#333333';
                ctx.fillRect(bx, btnY, 50, btnH);
                ctx.strokeStyle = isActive ? colors.neonCyan : '#555555';
                ctx.lineWidth = isActive ? 2 : 1;
                ctx.strokeRect(bx, btnY, 50, btnH);
                Sentinel.utils.drawText(ctx, (i + 1) + 'x', bx + 25, btnY + btnH / 2, 13, isActive ? '#ffffff' : '#888888');
            }

            // 뮤트 버튼
            var muteX = 480;
            var audio = Sentinel.managers.audio;
            ctx.fillStyle = '#333333';
            ctx.fillRect(muteX, btnY, 40, btnH);
            ctx.strokeStyle = '#555555';
            ctx.lineWidth = 1;
            ctx.strokeRect(muteX, btnY, 40, btnH);
            var muteIcon = audio.enabled ? '\uD83D\uDD0A' : '\uD83D\uDD07';
            Sentinel.utils.drawText(ctx, muteIcon, muteX + 20, btnY + btnH / 2, 16, '#ffffff');
        }

        // ═══════════════════════════════════════════════════
        // 카운트다운 오버레이
        // ═══════════════════════════════════════════════════

        renderCountdown() {
            if (!this.countdownDisplay) return;

            var ctx = this.ctx;
            var config = Sentinel.config;
            var cd = this.countdownDisplay;
            var progress = cd.elapsed / cd.duration;
            var alpha = 1 - progress;
            var scale = 1 + progress * 2;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(config.gameWidth / 2, config.hudHeight + config.gameHeight / 2);
            ctx.scale(scale, scale);
            ctx.font = 'bold 72px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = Sentinel.colors.neonCyan;
            ctx.shadowBlur = 30;
            ctx.fillText(cd.text, 0, 0);
            ctx.restore();
        }

        showCountdownNumber(text) {
            this.countdownDisplay = {
                text: text,
                elapsed: 0,
                duration: 0.8
            };
        }

        // ═══════════════════════════════════════════════════
        // 게임 오버 / 승리
        // ═══════════════════════════════════════════════════

        renderGameOver() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var cx = config.canvasWidth / 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            ctx.save();
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 20;
            Sentinel.utils.drawText(ctx, 'GAME OVER', cx, 180, 52, '#ff6b6b');
            ctx.restore();

            ctx.fillStyle = '#cccccc';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Wave Reached: ' + Sentinel.managers.wave.currentWave + '/' + config.totalWaves, cx, 260);
            ctx.fillText('Enemies Killed: ' + this.stats.enemiesKilled, cx, 290);
            ctx.fillText('Towers Built: ' + this.stats.towersBuilt, cx, 320);
            ctx.fillText('Gold Earned: ' + this.stats.goldEarned, cx, 350);

            this.renderPlayAgainButton(cx, 420);
        }

        renderVictory() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var cx = config.canvasWidth / 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            ctx.save();
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 30;
            Sentinel.utils.drawText(ctx, '★ VICTORY ★', cx, 170, 52, '#FFD700');
            ctx.restore();

            Sentinel.utils.drawText(ctx, 'All 10 waves defended!', cx, 230, 20, '#ffffff');

            ctx.fillStyle = '#cccccc';
            ctx.font = '18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Enemies Killed: ' + this.stats.enemiesKilled, cx, 280);
            ctx.fillText('Towers Built: ' + this.stats.towersBuilt, cx, 310);
            ctx.fillText('Gold Earned: ' + this.stats.goldEarned, cx, 340);
            ctx.fillText('Final Lives: ' + this.lives, cx, 370);

            this.renderPlayAgainButton(cx, 430);
        }

        renderPlayAgainButton(cx, btnCenterY) {
            var ctx = this.ctx;
            var btnW = 200;
            var btnH = 45;
            var btnX = cx - btnW / 2;
            var btnY = btnCenterY - btnH / 2;

            ctx.fillStyle = '#2a5a2a';
            ctx.strokeStyle = Sentinel.colors.electricGreen;
            ctx.lineWidth = 3;
            this.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
            ctx.fill();
            ctx.stroke();

            ctx.save();
            ctx.shadowColor = Sentinel.colors.electricGreen;
            ctx.shadowBlur = 10;
            Sentinel.utils.drawText(ctx, '↻ PLAY AGAIN', cx, btnCenterY, 20, '#ffffff');
            ctx.restore();

            this.playAgainBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
        }

        // ═══════════════════════════════════════════════════
        // 게임 액션
        // ═══════════════════════════════════════════════════

        placeTower(type, gridX, gridY) {
            var data = Sentinel.data.towers[type];
            if (this.gold < data.baseCost) return false;
            if (!Sentinel.managers.path.canPlaceTower(gridX, gridY)) return false;
            if (this.towers.some(function(t) { return t.gridX === gridX && t.gridY === gridY; })) return false;

            this.gold -= data.baseCost;
            var tower = new Sentinel.classes.Tower(type, gridX, gridY);
            this.towers.push(tower);
            this.stats.towersBuilt++;
            Sentinel.managers.audio.playTowerPlace();
            return true;
        }

        selectTower(tower) {
            this.towers.forEach(function(t) { t.selected = false; });
            this.selectedTower = tower;
            this.selectedTowerType = null;
            if (tower) tower.selected = true;
        }

        upgradeTower(tower) {
            if (tower.upgrade()) {
                Sentinel.managers.audio.playUpgrade();
                return true;
            }
            return false;
        }

        sellTower(tower) {
            var value = tower.getSellValue();
            this.gold += value;
            var index = this.towers.indexOf(tower);
            if (index !== -1) this.towers.splice(index, 1);
            if (this.selectedTower === tower) this.selectedTower = null;
            Sentinel.managers.audio.playTowerPlace();
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
            this.gameState = 'gameover';
            Sentinel.managers.audio.stopBGM();
            Sentinel.managers.audio.playGameOver();
        }

        victory() {
            this.gameState = 'victory';
            Sentinel.managers.audio.stopBGM();
            Sentinel.managers.audio.playVictory();
        }

        addGoldPopup(x, y, amount) {
            this.goldPopups.push({
                x: x, y: y - 20, amount: amount,
                alpha: 1, duration: 1.2, elapsed: 0
            });
        }

        // 유틸: 둥근 사각형
        roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
    }

    Sentinel.classes.Game = Game;
})();
