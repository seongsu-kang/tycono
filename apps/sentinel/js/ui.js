// Sentinel - UI Event Handler (폴리싱 버전)

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

            // 메인 메뉴
            if (game.gameState === 'menu') {
                if (game.menuPlayBtn) {
                    var btn = game.menuPlayBtn;
                    if (pos.x >= btn.x && pos.x <= btn.x + btn.w &&
                        pos.y >= btn.y && pos.y <= btn.y + btn.h) {
                        game.startGame();
                        Sentinel.managers.audio.playWaveStart();
                    }
                }
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

            // 하단 바 영역
            if (pos.y >= config.hudHeight + config.gameHeight) {
                this.handleBottomBarClick(pos.x, pos.y - (config.hudHeight + config.gameHeight));
                return;
            }
        }

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

        handleSidebarClick(x, y) {
            var game = this.game;
            var config = Sentinel.config;
            var w = config.sidebarWidth;

            // 타워 선택 버튼
            var towers = ['arrow', 'cannon', 'slow', 'sniper'];
            for (var i = 0; i < towers.length; i++) {
                var type = towers[i];
                var btnX = 10;
                var btnY = 10 + i * 75;
                var btnW = w - 20;
                var btnH = 65;

                if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
                    var data = Sentinel.data.towers[type];
                    if (game.gold >= data.baseCost) {
                        game.selectedTowerType = type;
                        game.selectedTower = null; game.towers.forEach(function(t) { t.selected = false; });
                        Sentinel.managers.audio.playTone(400, 0.05, 'sine', 0.15);
                    }
                    return;
                }
            }

            // 선택된 타워 업그레이드/판매 버튼
            if (game.selectedTower) {
                var tower = game.selectedTower;
                var infoY = config.gameHeight - 180;

                if (tower.level < 3) {
                    var upgBtnY = infoY + 105;
                    if (x >= 20 && x <= w - 20 && y >= upgBtnY && y <= upgBtnY + 25) {
                        game.upgradeTower(tower);
                        return;
                    }
                }

                var sellBtnY = infoY + 140;
                if (x >= 20 && x <= w - 20 && y >= sellBtnY && y <= sellBtnY + 25) {
                    game.sellTower(tower);
                    return;
                }
            }
        }

        handleBottomBarClick(x, y) {
            var game = this.game;
            var btnY = 10;
            var btnH = 30;

            // Start Wave
            if (x >= 20 && x <= 150 && y >= btnY && y <= btnY + btnH) {
                var wm = Sentinel.managers.wave;
                if (!wm.isSpawning && !wm.isCountingDown && wm.hasNextWave()) {
                    game.startNextWave();
                }
                return;
            }

            // Pause
            if (x >= 170 && x <= 270 && y >= btnY && y <= btnY + btnH) {
                game.togglePause();
                return;
            }

            // Speed (1x, 2x, 3x)
            for (var i = 0; i < 3; i++) {
                var btnX = 290 + i * 55;
                if (x >= btnX && x <= btnX + 50 && y >= btnY && y <= btnY + btnH) {
                    game.speed = i + 1;
                    return;
                }
            }

            // 뮤트
            if (x >= 480 && x <= 520 && y >= btnY && y <= btnY + btnH) {
                Sentinel.managers.audio.toggle();
                return;
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
