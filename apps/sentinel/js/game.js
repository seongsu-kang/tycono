// Sentinel - Game Class (CBO 디자인 스펙 반영)

(function() {
    'use strict';

    var SPEED_MULTIPLIERS = [1, 2, 3];
    var SPEED_LABELS = ['\u25B6 1x', '\u25B6\u25B6 2x', '\u25B6\u25B6\u25B6 3x'];
    var SPEED_COLORS = ['#ffffff', '#ffaa00', '#ff4444'];
    var SPEED_BORDERS = ['#3a4352', '#ffaa00', '#ff4444'];

    class Game {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');

            // 게임 상태 머신: menu → difficulty → playing → gameover/victory
            this.gameState = 'menu';
            this.difficulty = null;

            this.gold = 0;
            this.lives = 0;
            this.speed = 1;
            this.speedIndex = 0;
            this.isPaused = false;

            this.towers = [];
            this.enemies = [];
            this.projectiles = [];
            this.effects = [];
            this.goldPopups = [];

            this.selectedTower = null;
            this.selectedTowerType = null;
            this.hoverCell = null;

            // 오버레이 상태
            this.countdownDisplay = null;
            this.waveCompleteMsg = null; // { wave, bonus, elapsed, duration }
            this.bossWarning = null;     // { elapsed, duration }
            this.damageFlash = null;     // { elapsed, duration }

            this.stats = { enemiesKilled: 0, towersBuilt: 0, totalDamage: 0, goldEarned: 0 };
            this.menuTime = 0;
        }

        // ═══════════════════════════════════════════════════
        // 상태 전환
        // ═══════════════════════════════════════════════════

        showDifficulty() {
            this.gameState = 'difficulty';
        }

        startGame(difficultyKey) {
            this.difficulty = Sentinel.difficulties[difficultyKey];
            this.currentDifficultyKey = difficultyKey;
            this.gold = this.difficulty.gold;
            this.lives = this.difficulty.lives;
            this.speed = 1;
            this.speedIndex = 0;
            this.isPaused = false;
            this.playTime = 0;
            this.towers = [];
            this.enemies = [];
            this.projectiles = [];
            this.effects = [];
            this.goldPopups = [];
            this.selectedTower = null;
            this.selectedTowerType = null;
            this.hoverCell = null;
            this.countdownDisplay = null;
            this.waveCompleteMsg = null;
            this.bossWarning = null;
            this.damageFlash = null;
            this.stats = { enemiesKilled: 0, towersBuilt: 0, totalDamage: 0, goldEarned: 0 };
            this.pauseMenuBtns = null;
            this.gameOverBtns = null;
            this.victoryBtns = null;

            Sentinel.managers.path = new Sentinel.classes.PathManager();
            Sentinel.managers.wave = new Sentinel.classes.WaveManager();
            Sentinel.managers.audio.startBGM();
            this.gameState = 'playing';
        }

        restart() {
            Sentinel.managers.audio.stopBGM();
            this.gameState = 'menu';
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

        // ═══════════════════════════════════════════════════
        // 업데이트
        // ═══════════════════════════════════════════════════

        update(dt) {
            if (this.gameState !== 'playing') return;
            if (this.isPaused) return;

            this.playTime += dt;
            Sentinel.managers.wave.update(dt);

            // 카운트다운 비주얼
            if (this.countdownDisplay) {
                this.countdownDisplay.elapsed += dt;
                if (this.countdownDisplay.elapsed >= this.countdownDisplay.duration) this.countdownDisplay = null;
            }

            // 웨이브 완료 메시지
            if (this.waveCompleteMsg) {
                this.waveCompleteMsg.elapsed += dt;
                if (this.waveCompleteMsg.elapsed >= this.waveCompleteMsg.duration) this.waveCompleteMsg = null;
            }

            // 보스 경고
            if (this.bossWarning) {
                this.bossWarning.elapsed += dt;
                if (this.bossWarning.elapsed >= this.bossWarning.duration) this.bossWarning = null;
            }

            // 기지 피격 플래시
            if (this.damageFlash) {
                this.damageFlash.elapsed += dt;
                if (this.damageFlash.elapsed >= this.damageFlash.duration) this.damageFlash = null;
            }

            // 타워
            var self = this;
            this.towers.forEach(function(tower) { tower.update(dt, self.enemies); });

            // 투사체
            for (var i = this.projectiles.length - 1; i >= 0; i--) {
                this.projectiles[i].update(dt);
                if (!this.projectiles[i].active) this.projectiles.splice(i, 1);
            }

            // 적
            for (var i = this.enemies.length - 1; i >= 0; i--) {
                var enemy = this.enemies[i];
                enemy.update(dt);
                if (!enemy.active) {
                    if (enemy.reached) {
                        this.lives -= (enemy.data.liveDamage || 1);
                        this.damageFlash = { elapsed: 0, duration: 0.2 };
                        Sentinel.managers.audio.playTone(150, 0.2, 'sawtooth', 0.3);
                        if (this.lives <= 0) { this.lives = 0; this.gameOver(); }
                    } else {
                        this.gold += enemy.reward;
                        this.stats.enemiesKilled++;
                        this.stats.goldEarned += enemy.reward;
                        this.addGoldPopup(enemy.x, enemy.y, enemy.reward);
                        Sentinel.managers.audio.playEnemyDeath();
                        // 사망 이펙트: 확장 원형 + 페이드
                        this.effects.push({
                            type: 'death', x: enemy.x, y: enemy.y,
                            color: enemy.color, radius: enemy.getSize() + 15,
                            alpha: 0.6, duration: 0.3, elapsed: 0
                        });
                    }
                    this.enemies.splice(i, 1);
                }
            }

            // 이펙트
            for (var i = this.effects.length - 1; i >= 0; i--) {
                this.effects[i].elapsed += dt;
                if (this.effects[i].elapsed >= this.effects[i].duration) this.effects.splice(i, 1);
            }

            // 골드 팝업
            for (var i = this.goldPopups.length - 1; i >= 0; i--) {
                var p = this.goldPopups[i];
                p.elapsed += dt;
                p.y -= 30 * dt;
                p.alpha = 1 - (p.elapsed / p.duration);
                if (p.elapsed >= p.duration) this.goldPopups.splice(i, 1);
            }

            // 웨이브 완료 체크 — 유저가 Start Wave 클릭할 때까지 대기
            var wm = Sentinel.managers.wave;
            if (wm.isWaveComplete() && !wm.isCountingDown && !wm.waveCleared) {
                wm.waveCleared = true;
                if (wm.hasNextWave()) {
                    var bonus = wm.getCurrentWaveBonus();
                    this.gold += bonus;
                    this.stats.goldEarned += bonus;
                    this.showWaveComplete(wm.currentWave, bonus);
                } else if (this.enemies.length === 0) {
                    this.victory();
                }
            }
        }

        // ═══════════════════════════════════════════════════
        // 렌더링
        // ═══════════════════════════════════════════════════

        render() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;

            ctx.fillStyle = colors.deepNight;
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            if (this.gameState === 'menu') { this.renderMenu(); return; }
            if (this.gameState === 'difficulty') { this.renderDifficulty(); return; }

            // 게임 보드
            ctx.save();
            ctx.translate(0, config.hudHeight);
            this.renderGameBoard();
            ctx.restore();

            // UI
            this.renderTopBar();
            this.renderSidebar();

            // 오버레이
            this.renderCountdown();
            if (this.waveCompleteMsg) this.renderWaveCompleteMessage();
            if (this.bossWarning) this.renderBossWarningOverlay();
            if (this.damageFlash) this.renderDamageFlash();

            // 일시정지 메뉴
            if (this.isPaused && this.gameState === 'playing') this.renderPauseMenu();

            // 게임 오버/승리
            if (this.gameState === 'gameover') this.renderGameOver();
            else if (this.gameState === 'victory') this.renderVictory();
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

            var grad = ctx.createLinearGradient(0, 0, 0, config.canvasHeight);
            grad.addColorStop(0, '#0a0e1a');
            grad.addColorStop(1, '#1a2332');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 별 파티클
            ctx.save();
            for (var i = 0; i < 30; i++) {
                var px = ((i * 137.5) % config.canvasWidth);
                var py = ((i * 73.3 + this.menuTime * 10) % config.canvasHeight);
                ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.menuTime * 2 + i);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(px, py, 2, 2);
            }
            ctx.restore();

            // 타이틀
            ctx.save();
            ctx.shadowColor = colors.neonCyan;
            ctx.shadowBlur = 20;
            ctx.font = 'bold 48px Arial, Helvetica, sans-serif';
            ctx.fillStyle = colors.neonCyan;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SENTINEL', cx, 160);
            ctx.shadowBlur = 0;
            ctx.restore();

            // 서브타이틀
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('TOWER DEFENSE', cx, 200);

            // 구분선
            ctx.strokeStyle = colors.neonCyan;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - 100, 220);
            ctx.lineTo(cx + 100, 220);
            ctx.stroke();

            // PLAY 버튼
            var btnW = 280, btnH = 50;
            var btnX = cx - btnW / 2, btnY = 270;
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
            Sentinel.utils.drawText(ctx, '\u25B6  START GAME', cx, btnY + btnH / 2, 20, '#ffffff');
            ctx.restore();

            this.menuPlayBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

            // 조작법
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('\uC0AC\uC774\uB4DC\uBC14\uC5D0\uC11C \uD0C0\uC6CC \uC120\uD0DD \u2192 \uB9F5\uC5D0 \uD074\uB9AD\uD558\uC5EC \uBC30\uCE58', cx, 380);
            ctx.fillText('Start Wave\uB85C \uC6E8\uC774\uBE0C \uC2DC\uC791 | \uD0C0\uC6CC \uD074\uB9AD \u2192 \uC5C5\uADF8\uB808\uC774\uB4DC/\uD310\uB9E4', cx, 400);
            ctx.fillText('\uC6B0\uD074\uB9AD: \uC120\uD0DD \uCDE8\uC18C | \uBC30\uC18D: 1x/2x/3x', cx, 420);

            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '11px Arial';
            ctx.fillText('Sentinel Tower Defense \u2014 Built with Canvas 2D', cx, config.canvasHeight - 20);
        }

        // ═══════════════════════════════════════════════════
        // 난이도 선택 (style-guide §9.2)
        // ═══════════════════════════════════════════════════

        renderDifficulty() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var cx = config.canvasWidth / 2;

            var grad = ctx.createLinearGradient(0, 0, 0, config.canvasHeight);
            grad.addColorStop(0, '#0a0e1a');
            grad.addColorStop(1, '#1a2332');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 타이틀
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Select Difficulty', cx, 60);

            // 난이도 카드 3개
            var diffKeys = ['easy', 'normal', 'hard'];
            var cardW = 240, cardH = 260, gap = 20;
            var totalW = cardW * 3 + gap * 2;
            var startX = (config.canvasWidth - totalW) / 2;
            var cardY = 100;

            this.difficultyBtns = [];

            for (var i = 0; i < 3; i++) {
                var key = diffKeys[i];
                var diff = Sentinel.difficulties[key];
                var cardX = startX + i * (cardW + gap);

                // 카드 배경
                ctx.fillStyle = colors.darkSlate;
                ctx.fillRect(cardX, cardY, cardW, cardH);

                // 카드 테두리
                ctx.strokeStyle = diff.accentColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(cardX, cardY, cardW, cardH);

                // 난이도 이름
                ctx.fillStyle = diff.accentColor;
                ctx.font = 'bold 24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(diff.name, cardX + cardW / 2, cardY + 40);

                // 별
                var starStr = '';
                for (var s = 0; s < 3; s++) {
                    starStr += s < diff.stars ? '\u2605' : '\u2606';
                }
                ctx.fillStyle = colors.goldYellow;
                ctx.font = '20px Arial';
                ctx.fillText(starStr, cardX + cardW / 2, cardY + 70);

                // 스탯
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '14px Arial';
                ctx.textAlign = 'left';
                var sx = cardX + 30;
                ctx.fillText('\uC2DC\uC791 \uACE8\uB4DC: ' + diff.gold + 'G', sx, cardY + 110);
                ctx.fillText('\uC2DC\uC791 \uC0DD\uBA85: ' + diff.lives, sx, cardY + 135);
                ctx.fillText('\uC801 HP: \u00D7' + diff.hpMultiplier, sx, cardY + 160);
                ctx.fillText('\uBCF4\uC0C1: \u00D7' + diff.rewardMultiplier, sx, cardY + 185);

                // 선택 버튼
                var btnY2 = cardY + cardH - 50;
                ctx.fillStyle = colors.steelBlue;
                ctx.fillRect(cardX + 20, btnY2, cardW - 40, 35);
                ctx.strokeStyle = diff.accentColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(cardX + 20, btnY2, cardW - 40, 35);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('\uC120\uD0DD', cardX + cardW / 2, btnY2 + 18);

                this.difficultyBtns.push({ x: cardX, y: cardY, w: cardW, h: cardH, key: key });
            }

            // 뒤로 가기
            ctx.fillStyle = '#666666';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('\u2190 \uBA54\uB274\uB85C \uB3CC\uC544\uAC00\uAE30', cx, cardY + cardH + 40);
            this.backBtn = { x: cx - 100, y: cardY + cardH + 25, w: 200, h: 30 };
        }

        // ═══════════════════════════════════════════════════
        // 게임 보드
        // ═══════════════════════════════════════════════════

        renderGameBoard() {
            var ctx = this.ctx;

            Sentinel.managers.path.render(ctx);

            // 호버 셀 + 사거리 미리보기
            if (this.selectedTowerType && this.hoverCell) {
                var cellSize = Sentinel.config.cellSize;
                var canPlace = Sentinel.managers.path.canPlaceTower(this.hoverCell.gridX, this.hoverCell.gridY);
                var self = this;
                var hasTower = this.towers.some(function(t) {
                    return t.gridX === self.hoverCell.gridX && t.gridY === self.hoverCell.gridY;
                });
                var towerData = Sentinel.data.towers[this.selectedTowerType];
                var canAfford = this.gold >= towerData.baseCost;
                var valid = canPlace && canAfford && !hasTower;

                // 셀 하이라이트
                ctx.save();
                ctx.fillStyle = valid ? '#00ff9922' : '#ff444433';
                ctx.strokeStyle = valid ? '#00ff99' : '#ff4444';
                ctx.lineWidth = 2;
                ctx.fillRect(this.hoverCell.gridX * cellSize, this.hoverCell.gridY * cellSize, cellSize, cellSize);
                ctx.strokeRect(this.hoverCell.gridX * cellSize, this.hoverCell.gridY * cellSize, cellSize, cellSize);
                ctx.restore();

                // 사거리 미리보기
                if (valid) {
                    var pos = Sentinel.utils.gridToWorld(this.hoverCell.gridX, this.hoverCell.gridY);
                    Sentinel.utils.renderRangePreview(ctx, pos.x, pos.y, towerData.levels[0].range, true);
                }
            }

            this.towers.forEach(function(tower) { tower.render(ctx); });
            this.enemies.forEach(function(enemy) { enemy.render(ctx); });
            this.projectiles.forEach(function(proj) { proj.render(ctx); });
            this.renderEffects();
            this.renderGoldPopups();
        }

        renderEffects() {
            var ctx = this.ctx;
            this.effects.forEach(function(effect) {
                var progress = effect.elapsed / effect.duration;
                if (effect.type === 'explosion' || effect.type === 'heal') {
                    var radius = effect.radius * (0.5 + progress * 0.5);
                    var alpha = effect.alpha * (1 - progress);
                    Sentinel.utils.drawCircle(ctx, effect.x, effect.y, radius, effect.color, alpha);
                } else if (effect.type === 'laser') {
                    ctx.save();
                    ctx.globalAlpha = 1 - progress;
                    ctx.strokeStyle = effect.color;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = effect.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(effect.x1, effect.y1);
                    ctx.lineTo(effect.x2, effect.y2);
                    ctx.stroke();
                    ctx.restore();
                } else if (effect.type === 'death') {
                    var expandRadius = effect.radius * (0.5 + progress);
                    ctx.save();
                    ctx.globalAlpha = effect.alpha * (1 - progress);
                    ctx.strokeStyle = effect.color;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = effect.color;
                    ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, expandRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else if (effect.type === 'rage') {
                    ctx.save();
                    ctx.globalAlpha = 1 - progress;
                    ctx.font = 'bold 20px Arial';
                    ctx.fillStyle = effect.color;
                    ctx.textAlign = 'center';
                    ctx.shadowColor = effect.color;
                    ctx.shadowBlur = 15;
                    ctx.fillText(effect.text, effect.x, effect.y - progress * 30);
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
                ctx.shadowColor = colors.goldYellow;
                ctx.shadowBlur = 8;
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
            ctx.beginPath();
            ctx.moveTo(0, config.hudHeight);
            ctx.lineTo(config.canvasWidth, config.hudHeight);
            ctx.stroke();

            var y = config.hudHeight / 2;
            var wm = Sentinel.managers.wave;

            // 웨이브
            ctx.fillStyle = colors.neonCyan;
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('\uC6E8\uC774\uBE0C ' + wm.currentWave + '/' + config.totalWaves, 20, y);

            // 웨이브 진행 바
            if (wm.isSpawning || (wm.currentWave > 0 && this.enemies.length > 0)) {
                var barX = 150, barY = y - 6, barW = 100, barH = 12;
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
            }

            // 생명
            var livesColor = this.lives > 10 ? colors.electricGreen : (this.lives > 5 ? colors.warningOrange : colors.dangerRed);
            ctx.fillStyle = livesColor;
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('\u2665 ' + this.lives, 400, y);

            // 골드
            ctx.fillStyle = colors.goldYellow;
            ctx.textAlign = 'center';
            ctx.fillText('\u26C1 ' + this.gold + 'G', 560, y);

            // 골드 텍스트에 글로우
            ctx.save();
            ctx.shadowColor = colors.goldYellow;
            ctx.shadowBlur = 5;
            ctx.fillText('\u26C1 ' + this.gold + 'G', 560, y);
            ctx.restore();

            // 카운트다운 텍스트
            if (wm.isCountingDown) {
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '14px Arial';
                ctx.textAlign = 'right';
                ctx.fillText('Next: ' + Math.ceil(wm.countdown) + 's', config.canvasWidth - 20, y);
            }
        }

        // ═══════════════════════════════════════════════════
        // 사이드바 (타워카드 100px + 하단 컨트롤)
        // ═══════════════════════════════════════════════════

        renderSidebar() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var sx = config.gameWidth;
            var sy = config.hudHeight;
            var sw = config.sidebarWidth;
            var sh = config.gameHeight;

            // 패널 배경
            ctx.fillStyle = colors.deepNight;
            ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeStyle = colors.steelBlue;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, sy + sh);
            ctx.stroke();

            if (this.selectedTower) {
                this.renderTowerInfoPanel(ctx, sx, sy, sw, sh);
            } else {
                this.renderTowerSelectionPanel(ctx, sx, sy, sw, sh);
            }

            // 하단 컨트롤 (항상 표시)
            this.renderBottomControls(ctx, sx, sy, sw, sh);
        }

        renderTowerSelectionPanel(ctx, sx, sy, sw, sh) {
            var colors = Sentinel.colors;
            var towers = ['arrow', 'cannon', 'slow', 'sniper'];
            var self = this;

            towers.forEach(function(type, index) {
                var data = Sentinel.data.towers[type];
                var cardX = sx + 10;
                var cardY = sy + 10 + index * 88;
                var cardW = sw - 20;
                var cardH = 80;

                var canAfford = self.gold >= data.baseCost;
                var isSelected = self.selectedTowerType === type;

                // 카드 배경
                if (isSelected) {
                    ctx.fillStyle = colors.slateGray;
                    ctx.strokeStyle = colors.neonCyan;
                    ctx.lineWidth = 3;
                } else if (!canAfford) {
                    ctx.fillStyle = colors.darkSlate;
                    ctx.strokeStyle = '#2a3342';
                    ctx.lineWidth = 1;
                } else {
                    ctx.fillStyle = colors.steelBlue;
                    ctx.strokeStyle = '#3a4352';
                    ctx.lineWidth = 2;
                }
                ctx.fillRect(cardX, cardY, cardW, cardH);
                ctx.strokeRect(cardX, cardY, cardW, cardH);

                // 타워 아이콘 (카드 좌측)
                var iconX = cardX + 10 + 28;
                var iconY = cardY + cardH / 2;
                ctx.save();
                ctx.globalAlpha = canAfford ? 1 : 0.4;
                Sentinel.utils.renderTowerIcon(ctx, type, iconX, iconY, 24, 1);
                ctx.restore();

                // 타워 이름
                ctx.fillStyle = canAfford ? '#ffffff' : '#666666';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(data.name, cardX + 72, cardY + 10);

                // 스탯
                var level1 = data.levels[0];
                ctx.font = '11px Arial';
                ctx.fillStyle = canAfford ? '#aaaaaa' : '#555555';
                ctx.fillText('DMG ' + level1.damage + '  RNG ' + Math.round(level1.range / 48), cardX + 72, cardY + 30);
                ctx.fillText(data.description, cardX + 72, cardY + 48);

                // 가격 (우상단)
                ctx.fillStyle = canAfford ? colors.goldYellow : colors.dangerRed;
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.fillText(data.baseCost + 'G', cardX + cardW - 10, cardY + 10);

                ctx.textBaseline = 'alphabetic';
            });
        }

        renderTowerInfoPanel(ctx, sx, sy, sw, sh) {
            var colors = Sentinel.colors;
            var tower = this.selectedTower;
            var infoY = sy + 10;

            ctx.fillStyle = colors.steelBlue;
            ctx.fillRect(sx + 10, infoY, sw - 20, 250);
            ctx.strokeStyle = tower.data.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 10, infoY, sw - 20, 250);

            // 타워 아이콘 (중앙)
            Sentinel.utils.renderTowerIcon(ctx, tower.type, sx + sw / 2, infoY + 50, 30, tower.level);

            // 이름
            ctx.fillStyle = tower.data.color;
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(tower.data.name, sx + sw / 2, infoY + 95);

            // 스탯
            ctx.font = '13px Arial';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('Level: ' + tower.level + '/3', sx + 25, infoY + 120);
            ctx.fillText('Damage: ' + tower.stats.damage, sx + 25, infoY + 140);
            ctx.fillText('Range: ' + Math.round(tower.stats.range / 48) + '\uCE78', sx + 25, infoY + 160);
            ctx.fillText('Rate: ' + (1 / tower.stats.fireRate).toFixed(1) + '/s', sx + 25, infoY + 180);

            // 업그레이드 버튼
            if (tower.level < 3) {
                var upgCost = tower.stats.upgradeCost;
                var canUpgrade = this.gold >= upgCost;
                var ubtnY = infoY + 195;

                ctx.fillStyle = canUpgrade ? '#2a5a2a' : '#333333';
                ctx.fillRect(sx + 20, ubtnY, sw - 40, 25);
                ctx.strokeStyle = canUpgrade ? colors.electricGreen : '#555555';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 20, ubtnY, sw - 40, 25);

                ctx.fillStyle = canUpgrade ? '#ffffff' : '#666666';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Upgrade (' + upgCost + 'G)', sx + sw / 2, ubtnY + 13);
            } else {
                ctx.fillStyle = colors.goldYellow;
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('\u2605 MAX LEVEL \u2605', sx + sw / 2, infoY + 207);
            }

            // 판매 버튼
            var sellValue = tower.getSellValue();
            var sbtnY = infoY + 225;

            ctx.fillStyle = '#5a2a2a';
            ctx.fillRect(sx + 20, sbtnY, sw - 40, 25);
            ctx.strokeStyle = colors.dangerRed;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 20, sbtnY, sw - 40, 25);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Sell (' + sellValue + 'G)', sx + sw / 2, sbtnY + 13);
        }

        renderBottomControls(ctx, sx, sy, sw, sh) {
            var colors = Sentinel.colors;
            var wm = Sentinel.managers.wave;

            // 시작 웨이브 버튼
            var startBtnX = sx + 10;
            var startBtnY = sy + sh - 90;
            var startBtnW = sw - 20;
            var startBtnH = 40;

            var canStart = !wm.isSpawning && !wm.isCountingDown && wm.hasNextWave();
            ctx.fillStyle = canStart ? colors.slateGray : colors.steelBlue;
            ctx.fillRect(startBtnX, startBtnY, startBtnW, startBtnH);
            ctx.strokeStyle = colors.electricGreen;
            ctx.lineWidth = 2;
            ctx.strokeRect(startBtnX, startBtnY, startBtnW, startBtnH);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var startBtnLabel = wm.isSpawning ? '\uC9C4\uD589 \uC911...' : wm.isCountingDown ? '\uCE74\uC6B4\uD2B8\uB2E4\uC6B4...' : '\u25B6 \uC2DC\uC791 \uC6E8\uC774\uBE0C';
            ctx.fillText(startBtnLabel, startBtnX + startBtnW / 2, startBtnY + startBtnH / 2);

            // 일시정지 + 속도 버튼
            var pauseBtnX = sx + 10;
            var pauseBtnY = startBtnY + 50;
            var pauseBtnW = 105;
            var pauseBtnH = 35;

            // 일시정지
            ctx.fillStyle = colors.steelBlue;
            ctx.fillRect(pauseBtnX, pauseBtnY, pauseBtnW, pauseBtnH);
            ctx.strokeStyle = colors.warningOrange;
            ctx.lineWidth = 2;
            ctx.strokeRect(pauseBtnX, pauseBtnY, pauseBtnW, pauseBtnH);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px Arial';
            ctx.fillText(this.isPaused ? '\u25B6 \uC7AC\uAC1C' : '\u23F8 \uC77C\uC2DC\uC815\uC9C0',
                         pauseBtnX + pauseBtnW / 2, pauseBtnY + pauseBtnH / 2);

            // 속도 토글
            var speedBtnX = pauseBtnX + pauseBtnW + 10;
            var speedBtnW = sw - 20 - pauseBtnW - 10;

            if (this.isPaused) {
                ctx.fillStyle = colors.darkSlate;
                ctx.fillRect(speedBtnX, pauseBtnY, speedBtnW, pauseBtnH);
                ctx.strokeStyle = colors.steelBlue;
                ctx.lineWidth = 1;
                ctx.strokeRect(speedBtnX, pauseBtnY, speedBtnW, pauseBtnH);
                ctx.fillStyle = '#666666';
            } else {
                ctx.fillStyle = colors.steelBlue;
                ctx.fillRect(speedBtnX, pauseBtnY, speedBtnW, pauseBtnH);
                var si = this.speedIndex;
                ctx.strokeStyle = SPEED_BORDERS[si];
                ctx.lineWidth = 2;
                if (si > 0) {
                    ctx.shadowColor = SPEED_BORDERS[si];
                    ctx.shadowBlur = 8;
                }
                ctx.strokeRect(speedBtnX, pauseBtnY, speedBtnW, pauseBtnH);
                ctx.shadowBlur = 0;
                ctx.fillStyle = SPEED_COLORS[si];
            }
            ctx.fillText(SPEED_LABELS[this.speedIndex],
                         speedBtnX + speedBtnW / 2, pauseBtnY + pauseBtnH / 2);

            ctx.textBaseline = 'alphabetic';
        }

        // ═══════════════════════════════════════════════════
        // 오버레이
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

        renderWaveCompleteMessage() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var msg = this.waveCompleteMsg;
            var progress = msg.elapsed / msg.duration;
            var alpha = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;

            ctx.save();
            ctx.globalAlpha = alpha;

            ctx.fillStyle = '#00ff99';
            ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#00ff99';
            ctx.shadowBlur = 15;
            ctx.fillText('Wave ' + msg.wave + ' Complete!', config.gameWidth / 2, config.hudHeight + 220);

            ctx.fillStyle = '#ffdd00';
            ctx.font = 'bold 18px Arial';
            ctx.shadowColor = '#ffdd00';
            ctx.shadowBlur = 8;
            ctx.fillText('+' + msg.bonus + 'G', config.gameWidth / 2, config.hudHeight + 255);

            ctx.restore();
        }

        renderBossWarningOverlay() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var bw = this.bossWarning;
            var progress = bw.elapsed / bw.duration;
            var alpha = progress < 0.5 ? 1 : 1 - (progress - 0.5) / 0.5;

            ctx.save();
            ctx.globalAlpha = alpha * 0.2;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 36px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ff4444';
            ctx.shadowBlur = 20;
            ctx.fillText('BOSS INCOMING!', config.gameWidth / 2, config.hudHeight + config.gameHeight / 2);
            ctx.restore();
        }

        renderDamageFlash() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var df = this.damageFlash;
            var progress = df.elapsed / df.duration;
            var alpha = 0.35 * (1 - progress);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════
        // 일시정지 메뉴
        // ═══════════════════════════════════════════════════

        renderPauseMenu() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var cx = config.canvasWidth / 2;
            var cy = config.canvasHeight / 2;

            // 오버레이
            ctx.fillStyle = '#00000099';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            // 모달
            var mw = 300, mh = 280;
            var mx = cx - mw / 2, my = cy - mh / 2;

            ctx.fillStyle = '#1a2332';
            this.roundRect(ctx, mx, my, mw, mh, 12);
            ctx.fill();
            ctx.strokeStyle = '#00d9ff';
            ctx.lineWidth = 2;
            this.roundRect(ctx, mx, my, mw, mh, 12);
            ctx.stroke();

            // 제목
            ctx.fillStyle = '#00d9ff';
            ctx.font = 'bold 28px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('PAUSED', cx, my + 50);

            // 버튼 3개
            var btnW = 200, btnH = 45;
            var btnX = cx - btnW / 2;
            var btnStartY = my + 90;
            var btnGap = 12;

            var buttons = [
                { label: '\u25B6  Resume', border: '#00ff99', key: 'resume' },
                { label: '\u21BB  Restart', border: '#ffaa00', key: 'restart' },
                { label: '\u2302  Main Menu', border: '#3a4352', key: 'mainMenu' }
            ];

            this.pauseMenuBtns = {};

            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                var btnY = btnStartY + i * (btnH + btnGap);

                ctx.fillStyle = '#1a2332';
                this.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
                ctx.fill();
                ctx.strokeStyle = btn.border;
                ctx.lineWidth = 2;
                this.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(btn.label, cx, btnY + btnH / 2);

                this.pauseMenuBtns[btn.key] = { x: btnX, y: btnY, w: btnW, h: btnH };
            }

            ctx.textBaseline = 'alphabetic';
        }

        // ═══════════════════════════════════════════════════
        // 게임 오버 / 승리
        // ═══════════════════════════════════════════════════

        renderGameOver() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var cx = config.canvasWidth / 2;

            ctx.fillStyle = '#000000cc';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            var mw = 400, mh = 340;
            var mx = (config.canvasWidth - mw) / 2, my = (config.canvasHeight - mh) / 2;

            ctx.fillStyle = colors.darkSlate;
            ctx.fillRect(mx, my, mw, mh);
            ctx.strokeStyle = colors.dangerRed;
            ctx.lineWidth = 3;
            ctx.strokeRect(mx, my, mw, mh);

            ctx.save();
            ctx.fillStyle = colors.dangerRed;
            ctx.font = 'bold 32px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.shadowColor = colors.dangerRed;
            ctx.shadowBlur = 10;
            ctx.fillText('Game Over!', cx, my + 30);
            ctx.restore();

            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('\uC6E8\uC774\uBE0C: ' + Sentinel.managers.wave.currentWave + '/10', cx, my + 90);
            ctx.fillText('\uC801 \uCC98\uCE58: ' + this.stats.enemiesKilled + '\uB9C8\uB9AC', cx, my + 120);
            ctx.fillText('\uD0C0\uC6CC \uAC74\uC124: ' + this.stats.towersBuilt + '\uAC1C', cx, my + 150);

            // Retry + Main Menu 버튼 2개
            var btnW = 200, btnH = 45, btnGap = 12;
            var btnX = cx - btnW / 2;
            var retryY = my + mh - 120;
            var menuY = retryY + btnH + btnGap;

            // Retry 버튼
            ctx.fillStyle = '#1a2a3a';
            this.roundRect(ctx, btnX, retryY, btnW, btnH, 8);
            ctx.fill();
            ctx.strokeStyle = '#00d9ff';
            ctx.lineWidth = 2;
            this.roundRect(ctx, btnX, retryY, btnW, btnH, 8);
            ctx.stroke();
            ctx.save();
            ctx.shadowColor = '#00d9ff';
            ctx.shadowBlur = 10;
            Sentinel.utils.drawText(ctx, '\u21BB  Retry', cx, retryY + btnH / 2, 16, '#ffffff');
            ctx.restore();

            // Main Menu 버튼
            ctx.fillStyle = '#1a2a3a';
            this.roundRect(ctx, btnX, menuY, btnW, btnH, 8);
            ctx.fill();
            ctx.strokeStyle = '#3a4352';
            ctx.lineWidth = 2;
            this.roundRect(ctx, btnX, menuY, btnW, btnH, 8);
            ctx.stroke();
            Sentinel.utils.drawText(ctx, '\u2302  Main Menu', cx, menuY + btnH / 2, 16, '#ffffff');

            this.gameOverBtns = {
                retry: { x: btnX, y: retryY, w: btnW, h: btnH },
                mainMenu: { x: btnX, y: menuY, w: btnW, h: btnH }
            };
        }

        renderVictory() {
            var ctx = this.ctx;
            var config = Sentinel.config;
            var colors = Sentinel.colors;
            var cx = config.canvasWidth / 2;

            ctx.fillStyle = '#000000cc';
            ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

            var mw = 400, mh = 420;
            var mx = (config.canvasWidth - mw) / 2, my = (config.canvasHeight - mh) / 2;

            ctx.fillStyle = colors.darkSlate;
            ctx.fillRect(mx, my, mw, mh);
            ctx.strokeStyle = colors.electricGreen;
            ctx.lineWidth = 3;
            ctx.strokeRect(mx, my, mw, mh);

            ctx.save();
            ctx.fillStyle = colors.electricGreen;
            ctx.font = 'bold 32px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.shadowColor = colors.electricGreen;
            ctx.shadowBlur = 10;
            ctx.fillText('Victory!', cx, my + 25);
            ctx.restore();

            // Final Score
            var finalScore = this.lives * 100 + this.stats.goldEarned;
            ctx.save();
            ctx.fillStyle = '#ffdd00';
            ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowColor = '#ffdd00';
            ctx.shadowBlur = 8;
            ctx.fillText('Final Score: ' + finalScore, cx, my + 80);
            ctx.restore();

            // Play Time (MM:SS)
            var totalSec = Math.floor(this.playTime);
            var mins = Math.floor(totalSec / 60);
            var secs = totalSec % 60;
            var timeStr = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
            ctx.fillStyle = '#aaaaaa';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Play Time: ' + timeStr, cx, my + 115);

            // 스탯
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Arial';
            ctx.fillText('10\uC6E8\uC774\uBE0C \uC644\uB8CC!', cx, my + 150);
            ctx.fillText('\uC801 \uCC98\uCE58: ' + this.stats.enemiesKilled + '\uB9C8\uB9AC', cx, my + 180);
            ctx.fillText('\uD0C0\uC6CC \uAC74\uC124: ' + this.stats.towersBuilt + '\uAC1C', cx, my + 210);
            ctx.fillText('\uB0A8\uC740 \uC0DD\uBA85: ' + this.lives, cx, my + 240);

            // Play Again + Main Menu 버튼 2개
            var btnW = 200, btnH = 45, btnGap = 12;
            var btnX = cx - btnW / 2;
            var playAgainY = my + mh - 120;
            var menuY = playAgainY + btnH + btnGap;

            // Play Again 버튼
            ctx.fillStyle = '#1a2a3a';
            this.roundRect(ctx, btnX, playAgainY, btnW, btnH, 8);
            ctx.fill();
            ctx.strokeStyle = '#00d9ff';
            ctx.lineWidth = 2;
            this.roundRect(ctx, btnX, playAgainY, btnW, btnH, 8);
            ctx.stroke();
            ctx.save();
            ctx.shadowColor = '#00d9ff';
            ctx.shadowBlur = 10;
            Sentinel.utils.drawText(ctx, '\u21BB  Play Again', cx, playAgainY + btnH / 2, 16, '#ffffff');
            ctx.restore();

            // Main Menu 버튼
            ctx.fillStyle = '#1a2a3a';
            this.roundRect(ctx, btnX, menuY, btnW, btnH, 8);
            ctx.fill();
            ctx.strokeStyle = '#3a4352';
            ctx.lineWidth = 2;
            this.roundRect(ctx, btnX, menuY, btnW, btnH, 8);
            ctx.stroke();
            Sentinel.utils.drawText(ctx, '\u2302  Main Menu', cx, menuY + btnH / 2, 16, '#ffffff');

            this.victoryBtns = {
                playAgain: { x: btnX, y: playAgainY, w: btnW, h: btnH },
                mainMenu: { x: btnX, y: menuY, w: btnW, h: btnH }
            };
        }

        renderPlayAgainButton(ctx, cx, btnCenterY) {
            var btnW = 200, btnH = 45;
            var btnX = cx - btnW / 2, btnY = btnCenterY - btnH / 2;

            ctx.fillStyle = '#2a5a2a';
            ctx.strokeStyle = Sentinel.colors.electricGreen;
            ctx.lineWidth = 3;
            this.roundRect(ctx, btnX, btnY, btnW, btnH, 8);
            ctx.fill();
            ctx.stroke();

            ctx.save();
            ctx.shadowColor = Sentinel.colors.electricGreen;
            ctx.shadowBlur = 10;
            Sentinel.utils.drawText(ctx, '\u21BB PLAY AGAIN', cx, btnCenterY, 18, '#ffffff');
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
            var wm = Sentinel.managers.wave;
            if (!wm.isSpawning && !wm.isCountingDown && wm.hasNextWave()) {
                wm.startCountdown(3);
                Sentinel.managers.audio.playWaveStart();
            }
        }

        toggleSpeed() {
            this.speedIndex = (this.speedIndex + 1) % 3;
            this.speed = SPEED_MULTIPLIERS[this.speedIndex];
        }

        togglePause() { this.isPaused = !this.isPaused; }

        addGoldPopup(x, y, amount) {
            this.goldPopups.push({
                x: x, y: y - 20, amount: amount,
                alpha: 1, duration: 0.8, elapsed: 0
            });
        }

        showCountdownNumber(text) {
            this.countdownDisplay = { text: text, elapsed: 0, duration: 0.8 };
        }

        showWaveComplete(wave, bonus) {
            this.waveCompleteMsg = { wave: wave, bonus: bonus, elapsed: 0, duration: 2.0 };
        }

        showBossWarning() {
            this.bossWarning = { elapsed: 0, duration: 1.5 };
        }

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
