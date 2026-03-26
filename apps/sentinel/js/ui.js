// Sentinel - UI Event Handler

(function() {
    'use strict';

    class UIManager {
        constructor(game) {
            this.game = game;
            this.canvas = game.canvas;
            this.init();
        }

        init() {
            this.canvas.addEventListener('click', (e) => this.handleClick(e));
            this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
            this.canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.handleRightClick(e);
            });

            console.log('[UIManager] Event listeners attached');
        }

        getMousePos(e) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }

        handleClick(e) {
            const pos = this.getMousePos(e);
            const config = Sentinel.config;

            // 게임 오버/승리 시 클릭 무시
            if (this.game.isGameOver || this.game.isVictory) return;

            // 게임 보드 영역
            if (pos.x < config.gameWidth && pos.y >= config.topBarHeight && pos.y < config.topBarHeight + config.gameHeight) {
                this.handleGameBoardClick(pos.x, pos.y - config.topBarHeight);
                return;
            }

            // 사이드바 영역
            if (pos.x >= config.gameWidth && pos.y >= config.topBarHeight && pos.y < config.topBarHeight + config.gameHeight) {
                this.handleSidebarClick(pos.x - config.gameWidth, pos.y - config.topBarHeight);
                return;
            }

            // 하단 바 영역
            if (pos.y >= config.topBarHeight + config.gameHeight) {
                this.handleBottomBarClick(pos.x, pos.y - (config.topBarHeight + config.gameHeight));
                return;
            }
        }

        handleGameBoardClick(x, y) {
            // 타워 선택 타입이 있으면 배치
            if (this.game.selectedTowerType) {
                const grid = Sentinel.utils.worldToGrid(x, y);
                if (this.game.placeTower(this.game.selectedTowerType, grid.gridX, grid.gridY)) {
                    // 배치 성공
                    this.game.selectedTowerType = null;
                }
            } else {
                // 타워 선택
                const clicked = this.getTowerAt(x, y);
                this.game.selectTower(clicked);
            }
        }

        handleSidebarClick(x, y) {
            const config = Sentinel.config;
            const w = config.sidebarWidth;

            // 타워 선택 버튼
            const towers = ['arrow', 'cannon', 'slow', 'sniper'];
            towers.forEach((type, index) => {
                const btnX = 20;
                const btnY = 60 + index * 90;
                const btnW = w - 40;
                const btnH = 70;

                if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
                    const data = Sentinel.data.towers[type];
                    if (this.game.gold >= data.baseCost) {
                        this.game.selectedTowerType = type;
                        this.game.selectTower(null);
                        console.log('[UI] Tower type selected:', type);
                    }
                }
            });

            // 선택된 타워 업그레이드/판매 버튼
            if (this.game.selectedTower) {
                const tower = this.game.selectedTower;
                const infoY = config.gameHeight - 180;

                // 업그레이드 버튼
                if (tower.level < 3) {
                    const upgBtnY = infoY + 110;
                    if (x >= 20 && x <= w - 20 && y >= upgBtnY && y <= upgBtnY + 25) {
                        this.game.upgradeTower(tower);
                    }
                }

                // 판매 버튼
                const sellBtnY = infoY + 142;
                if (x >= 20 && x <= w - 20 && y >= sellBtnY && y <= sellBtnY + 25) {
                    this.game.sellTower(tower);
                }
            }
        }

        handleBottomBarClick(x, y) {
            const btnY = 15;
            const btnH = 30;

            // Start Wave 버튼
            if (x >= 20 && x <= 140 && y >= btnY && y <= btnY + btnH) {
                if (!Sentinel.managers.wave.isSpawning && !Sentinel.managers.wave.isCountingDown) {
                    this.game.startNextWave();
                }
            }

            // Pause 버튼
            const pauseBtnX = 160;
            if (x >= pauseBtnX && x <= pauseBtnX + 100 && y >= btnY && y <= btnY + btnH) {
                this.game.togglePause();
            }

            // Speed 버튼
            const speedBtnX = 280;
            for (let i = 0; i < 3; i++) {
                const btnX = speedBtnX + i * 60;
                if (x >= btnX && x <= btnX + 55 && y >= btnY && y <= btnY + btnH) {
                    this.game.speed = i + 1;
                    console.log('[UI] Speed changed to', this.game.speed + 'x');
                }
            }
        }

        handleMouseMove(e) {
            const pos = this.getMousePos(e);
            const config = Sentinel.config;

            // 게임 보드 위에서 호버
            if (pos.x < config.gameWidth && pos.y >= config.topBarHeight && pos.y < config.topBarHeight + config.gameHeight) {
                const boardY = pos.y - config.topBarHeight;
                const grid = Sentinel.utils.worldToGrid(pos.x, boardY);

                // 타워 배치 모드일 때만 호버 표시
                if (this.game.selectedTowerType) {
                    this.game.hoverCell = grid;
                } else {
                    this.game.hoverCell = null;
                }
            } else {
                this.game.hoverCell = null;
            }
        }

        handleRightClick(e) {
            // 우클릭으로 선택/배치 모드 취소
            this.game.selectedTowerType = null;
            this.game.selectTower(null);
        }

        getTowerAt(x, y) {
            const clickRadius = 20;
            for (const tower of this.game.towers) {
                const dist = Sentinel.utils.distance(x, y, tower.x, tower.y);
                if (dist <= clickRadius) {
                    return tower;
                }
            }
            return null;
        }
    }

    Sentinel.classes.UIManager = UIManager;
    console.log('[Sentinel] UIManager loaded');
})();
