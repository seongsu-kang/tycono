// Sentinel - UI Event Handler (CBO 디자인 스펙 반영)

(function() {
    'use strict';

    class UIManager {
        constructor(game) {
            this.game = game;
            this.canvas = game.canvas;
            this.init();
        }

        init() {
            var self = this;

            this.canvas.addEventListener('click', function(e) { self.handleClick(e); });
            this.canvas.addEventListener('mousemove', function(e) { self.handleMouseMove(e); });
            this.canvas.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                self.handleRightClick(e);
            });

            // Touch events
            this.canvas.addEventListener('touchstart', function(e) {
                e.preventDefault();
                var touch = e.touches[0];
                var mouseEvent = new MouseEvent('click', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                self.handleClick(mouseEvent);
            });

            this.canvas.addEventListener('touchmove', function(e) {
                e.preventDefault();
                var touch = e.touches[0];
                var mouseEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                self.handleMouseMove(mouseEvent);
            });
        }

        getCanvasPos(e) {
            var rect = this.canvas.getBoundingClientRect();
            var scaleX = this.canvas.width / rect.width;
            var scaleY = this.canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }

        handleClick(e) {
            var pos = this.getCanvasPos(e);
            var game = this.game;
            var config = Sentinel.config;

            // 메인 메뉴 → 난이도 화면으로
            if (game.gameState === 'menu') {
                if (game.menuPlayBtn) {
                    var btn = game.menuPlayBtn;
                    if (pos.x >= btn.x && pos.x <= btn.x + btn.w &&
                        pos.y >= btn.y && pos.y <= btn.y + btn.h) {
                        game.showDifficulty();
                        Sentinel.managers.audio.playTone(400, 0.1, 'sine', 0.15);
                    }
                }
                return;
            }

            // 난이도 선택 화면
            if (game.gameState === 'difficulty') {
                this.handleDifficultyClick(pos);
                return;
            }

            // 게임 오버 / 승리 — Play Again
            if (game.gameState === 'gameover' || game.gameState === 'victory') {
                if (game.playAgainBtn) {
                    var btn = game.playAgainBtn;
                    if (pos.x >= btn.x && pos.x <= btn.x + btn.w &&
                        pos.y >= btn.y && pos.y <= btn.y + btn.h) {
                        game.restart();
                        Sentinel.managers.audio.playTowerPlace();
                    }
                }
                return;
            }

            // 게임 보드 영역
            if (pos.x < config.gameWidth && pos.y >= config.hudHeight && pos.y < config.hudHeight + config.gameHeight) {
                this.handleGameBoardClick(pos.x, pos.y - config.hudHeight);
                return;
            }

            // 사이드바 영역
            if (pos.x >= config.gameWidth && pos.y >= config.hudHeight && pos.y < config.hudHeight + config.gameHeight) {
                this.handleSidebarClick(pos.x - config.gameWidth, pos.y - config.hudHeight);
                return;
            }
        }

        // ═══════════════════════════════════════════════
        // 난이도 선택 클릭
        // ═══════════════════════════════════════════════

        handleDifficultyClick(pos) {
            var game = this.game;

            // 난이도 카드 클릭
            if (game.difficultyBtns) {
                for (var i = 0; i < game.difficultyBtns.length; i++) {
                    var btn = game.difficultyBtns[i];
                    if (pos.x >= btn.x && pos.x <= btn.x + btn.w &&
                        pos.y >= btn.y && pos.y <= btn.y + btn.h) {
                        game.startGame(btn.key);
                        Sentinel.managers.audio.playWaveStart();
                        return;
                    }
                }
            }

            // 뒤로가기 버튼
            if (game.backBtn) {
                var back = game.backBtn;
                if (pos.x >= back.x && pos.x <= back.x + back.w &&
                    pos.y >= back.y && pos.y <= back.y + back.h) {
                    game.restart();
                    Sentinel.managers.audio.playTone(300, 0.05, 'sine', 0.15);
                }
            }
        }

        // ═══════════════════════════════════════════════
        // 게임 보드 클릭
        // ═══════════════════════════════════════════════

        handleGameBoardClick(x, y) {
            var game = this.game;

            if (game.selectedTowerType) {
                var grid = Sentinel.utils.worldToGrid(x, y);
                if (game.placeTower(game.selectedTowerType, grid.gridX, grid.gridY)) {
                    // 배치 성공 — 같은 타워 타입 유지 (연속 배치)
                    var data = Sentinel.data.towers[game.selectedTowerType];
                    if (game.gold < data.baseCost) {
                        game.selectedTowerType = null;
                    }
                }
            } else {
                var clicked = this.getTowerAt(x, y);
                game.selectTower(clicked);
            }
        }

        // ═══════════════════════════════════════════════
        // 사이드바 클릭 (타워카드 + 하단 컨트롤)
        // ═══════════════════════════════════════════════

        handleSidebarClick(x, y) {
            var game = this.game;
            var config = Sentinel.config;
            var sw = config.sidebarWidth;
            var sh = config.gameHeight;

            // ── 하단 컨트롤 (먼저 체크, 항상 표시) ──

            // Start Wave 버튼: (10, sh-90) ~ (sw-10, sh-50)
            var startBtnY = sh - 90;
            if (x >= 10 && x <= sw - 10 && y >= startBtnY && y <= startBtnY + 40) {
                var wm = Sentinel.managers.wave;
                if (!wm.isSpawning && !wm.isCountingDown && wm.hasNextWave()) {
                    game.startNextWave();
                }
                return;
            }

            // Pause 버튼: (10, sh-40) ~ (115, sh-5)
            var ctrlBtnY = startBtnY + 50;
            if (x >= 10 && x <= 115 && y >= ctrlBtnY && y <= ctrlBtnY + 35) {
                game.togglePause();
                return;
            }

            // Speed 버튼: (125, sh-40) ~ (sw-10, sh-5)
            if (x >= 125 && x <= sw - 10 && y >= ctrlBtnY && y <= ctrlBtnY + 35) {
                if (!game.isPaused) {
                    game.toggleSpeed();
                }
                return;
            }

            // ── 타워 정보 패널 (선택된 타워가 있을 때) ──

            if (game.selectedTower) {
                var tower = game.selectedTower;

                // 업그레이드 버튼: (20, 205) ~ (sw-20, 230)
                if (tower.level < 3) {
                    if (x >= 20 && x <= sw - 20 && y >= 205 && y <= 230) {
                        game.upgradeTower(tower);
                        return;
                    }
                }

                // 판매 버튼: (20, 235) ~ (sw-20, 260)
                if (x >= 20 && x <= sw - 20 && y >= 235 && y <= 260) {
                    game.sellTower(tower);
                    return;
                }

                // 정보 패널 바깥 클릭 → 선택 해제
                return;
            }

            // ── 타워 선택 카드 (88px 간격, 80px 높이) ──

            var towers = ['arrow', 'cannon', 'slow', 'sniper'];
            for (var i = 0; i < towers.length; i++) {
                var type = towers[i];
                var btnX = 10;
                var btnY = 10 + i * 88;
                var btnW = sw - 20;
                var btnH = 80;

                if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
                    var data = Sentinel.data.towers[type];
                    if (game.gold >= data.baseCost) {
                        game.selectedTowerType = type;
                        game.selectedTower = null;
                        game.towers.forEach(function(t) { t.selected = false; });
                        Sentinel.managers.audio.playTone(400, 0.05, 'sine', 0.15);
                    }
                    return;
                }
            }
        }

        handleMouseMove(e) {
            var pos = this.getCanvasPos(e);
            var config = Sentinel.config;
            var game = this.game;

            if (game.gameState !== 'playing') {
                game.hoverCell = null;
                return;
            }

            if (pos.x < config.gameWidth && pos.y >= config.hudHeight && pos.y < config.hudHeight + config.gameHeight) {
                var boardY = pos.y - config.hudHeight;
                var grid = Sentinel.utils.worldToGrid(pos.x, boardY);
                if (game.selectedTowerType) {
                    game.hoverCell = grid;
                } else {
                    game.hoverCell = null;
                }
            } else {
                game.hoverCell = null;
            }
        }

        handleRightClick(e) {
            this.game.selectedTowerType = null;
            this.game.selectedTower = null;
            this.game.towers.forEach(function(t) { t.selected = false; });
        }

        getTowerAt(x, y) {
            var clickRadius = Sentinel.config.cellSize * 0.5;
            for (var i = 0; i < this.game.towers.length; i++) {
                var tower = this.game.towers[i];
                var dist = Sentinel.utils.distance(x, y, tower.x, tower.y);
                if (dist <= clickRadius) return tower;
            }
            return null;
        }
    }

    Sentinel.classes.UIManager = UIManager;
})();
