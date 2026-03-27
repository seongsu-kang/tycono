(function() {
    'use strict';
    var S = window.Sentinel;

    S.Input = {
        canvas: null,
        game: null,
        mouseX: 0,
        mouseY: 0,
        mouseCell: null,

        init: function(canvas, game) {
            this.canvas = canvas;
            this.game = game;

            var self = this;

            // Mouse move
            canvas.addEventListener('mousemove', function(e) {
                self.handleMouseMove(e);
            });

            // Left click
            canvas.addEventListener('click', function(e) {
                self.handleClick(e);
            });

            // Right click (hero move)
            canvas.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                self.handleRightClick(e);
            });

            // Keyboard
            document.addEventListener('keydown', function(e) {
                self.handleKeyDown(e);
            });

            // Touch support
            canvas.addEventListener('touchstart', function(e) {
                e.preventDefault();
                if (e.touches.length > 0) {
                    var touch = e.touches[0];
                    var rect = canvas.getBoundingClientRect();
                    var scaleX = canvas.width / rect.width;
                    var scaleY = canvas.height / rect.height;
                    self.mouseX = (touch.clientX - rect.left) * scaleX;
                    self.mouseY = (touch.clientY - rect.top) * scaleY;
                    self.processClick(self.mouseX, self.mouseY, false);
                }
            }, { passive: false });
        },

        getCanvasPos: function(e) {
            var rect = this.canvas.getBoundingClientRect();
            var scaleX = this.canvas.width / rect.width;
            var scaleY = this.canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        },

        handleMouseMove: function(e) {
            var pos = this.getCanvasPos(e);
            this.mouseX = pos.x;
            this.mouseY = pos.y;

            var game = this.game;
            if (game.state === 'playing' && game.mapData) {
                game.mouseCell = S.Utils.pixelToCell(pos.x, pos.y, game.mapData);
            }
        },

        handleClick: function(e) {
            var pos = this.getCanvasPos(e);
            this.processClick(pos.x, pos.y, false);
        },

        handleRightClick: function(e) {
            var pos = this.getCanvasPos(e);
            this.processClick(pos.x, pos.y, true);
        },

        processClick: function(x, y, isRightClick) {
            var game = this.game;

            // Right click: hero move (only during gameplay)
            if (isRightClick) {
                if (game.state === 'playing' && !game.paused && game.hero) {
                    if (x >= S.GAME_BOARD_X && x <= S.GAME_BOARD_X + S.GAME_BOARD_WIDTH &&
                        y >= S.GAME_BOARD_Y && y <= S.GAME_BOARD_Y + S.GAME_BOARD_HEIGHT) {
                        game.hero.moveTo(x, y);
                        if (S.audio) S.audio.playClick();
                    }
                }
                return;
            }

            // Route by state
            switch (game.state) {
                case 'menu':
                    this.handleMenuClick(x, y);
                    break;
                case 'mapSelect':
                    this.handleMapSelectClick(x, y);
                    break;
                case 'difficultySelect':
                    this.handleDifficultySelectClick(x, y);
                    break;
                case 'howToPlay':
                    this.handleHowToPlayClick(x, y);
                    break;
                case 'credits':
                    this.handleCreditsClick(x, y);
                    break;
                case 'playing':
                    this.handlePlayingClick(x, y);
                    break;
                case 'paused':
                    this.handlePauseClick(x, y);
                    break;
                case 'gameover':
                    this.handleGameOverClick(x, y);
                    break;
                case 'victory':
                    this.handleVictoryClick(x, y);
                    break;
            }
        },

        handleMenuClick: function(x, y) {
            var action = S.Menu.handleMainMenuClick(x, y);
            if (!action) return;

            if (S.audio) S.audio.playClick();

            switch (action) {
                case 'play':
                    this.game.setState('mapSelect');
                    break;
                case 'howToPlay':
                    this.game.setState('howToPlay');
                    break;
                case 'credits':
                    this.game.setState('credits');
                    break;
            }
        },

        handleMapSelectClick: function(x, y) {
            var action = S.Menu.handleMapSelectClick(x, y, this.game);
            if (!action) return;

            if (S.audio) S.audio.playClick();

            if (action === 'back') {
                this.game.setState('menu');
            } else {
                // action is map id
                this.game.selectedMapId = action;
                this.game.setState('difficultySelect');
            }
        },

        handleDifficultySelectClick: function(x, y) {
            var action = S.Menu.handleDifficultySelectClick(x, y);
            if (!action) return;

            if (S.audio) S.audio.playClick();

            if (action === 'back') {
                this.game.setState('mapSelect');
            } else {
                // action is difficulty id
                this.game.startGame(this.game.selectedMapId, action);
            }
        },

        handleHowToPlayClick: function(x, y) {
            var action = S.Menu.handleHowToPlayClick(x, y);
            if (action === 'back') {
                if (S.audio) S.audio.playClick();
                this.game.setState('menu');
            }
        },

        handleCreditsClick: function(x, y) {
            var action = S.Menu.handleCreditsClick(x, y);
            if (action === 'back') {
                if (S.audio) S.audio.playClick();
                this.game.setState('menu');
            }
        },

        handlePlayingClick: function(x, y) {
            var game = this.game;

            // Check HUD clicks first
            var hudAction = S.HUD.getClickArea(x, y, game);
            if (hudAction) {
                if (S.audio) S.audio.playClick();
                switch (hudAction) {
                    case 'pause':
                        game.togglePause();
                        break;
                    case 'mute':
                        game.toggleMute();
                        break;
                    case 'speed':
                        game.cycleSpeed();
                        break;
                }
                return;
            }

            // Check sidebar clicks
            var sideAction = S.Sidebar.handleClick(x, y, game);
            if (sideAction) {
                if (S.audio) S.audio.playClick();
                this.processSidebarAction(sideAction, game);
                return;
            }

            // Game board click
            if (x >= S.GAME_BOARD_X && x <= S.GAME_BOARD_X + S.GAME_BOARD_WIDTH &&
                y >= S.GAME_BOARD_Y && y <= S.GAME_BOARD_Y + S.GAME_BOARD_HEIGHT) {

                if (game.placingTower) {
                    // Try to place tower
                    var cell = S.Utils.pixelToCell(x, y, game.mapData);
                    if (cell && game.canPlaceTower(cell.col, cell.row)) {
                        game.placeTower(cell.col, cell.row, game.placingTower);
                    } else {
                        if (S.audio) S.audio.playError();
                    }
                } else {
                    // Try to select tower
                    var cell = S.Utils.pixelToCell(x, y, game.mapData);
                    if (cell) {
                        var tower = game.getTowerAt(cell.col, cell.row);
                        if (tower) {
                            game.selectTower(tower);
                            if (S.audio) S.audio.playClick();
                        } else {
                            game.deselectTower();
                        }
                    }
                }
            }
        },

        processSidebarAction: function(action, game) {
            if (!action) return;

            switch (action.type) {
                case 'selectTower':
                    // Start placement mode
                    var cost = S.Economy.getTowerCost(action.towerId);
                    if (game.gold >= cost) {
                        game.placingTower = action.towerId;
                        game.deselectTower();
                    } else {
                        if (S.audio) S.audio.playError();
                    }
                    break;

                case 'upgrade':
                    if (game.selectedTower) {
                        game.upgradeTower(game.selectedTower);
                    }
                    break;

                case 'sell':
                    if (game.selectedTower) {
                        game.sellTower(game.selectedTower);
                    }
                    break;

                case 'heroAbility':
                    if (game.hero) {
                        var used = game.hero.useActive(game);
                        if (!used && S.audio) S.audio.playError();
                    }
                    break;

                case 'startWave':
                    game.startNextWave();
                    break;

                case 'deselect':
                    game.deselectTower();
                    game.placingTower = null;
                    break;
            }
        },

        handlePauseClick: function(x, y) {
            var action = S.Modal.handlePauseClick(x, y);
            if (!action) return;

            if (S.audio) S.audio.playClick();

            switch (action) {
                case 'resume':
                    this.game.togglePause();
                    break;
                case 'restart':
                    this.game.startGame(this.game.mapData.id, this.game.difficulty);
                    break;
                case 'quit':
                    this.game.setState('menu');
                    break;
            }
        },

        handleGameOverClick: function(x, y) {
            var action = S.Modal.handleGameOverClick(x, y);
            if (!action) return;

            if (S.audio) S.audio.playClick();

            switch (action) {
                case 'retry':
                    this.game.startGame(this.game.mapData.id, this.game.difficulty);
                    break;
                case 'menu':
                    this.game.setState('menu');
                    break;
            }
        },

        handleVictoryClick: function(x, y) {
            var action = S.Modal.handleVictoryClick(x, y);
            if (!action) return;

            if (S.audio) S.audio.playClick();

            switch (action) {
                case 'next':
                    this.game.goToNextMap();
                    break;
                case 'mapSelect':
                    this.game.setState('mapSelect');
                    break;
            }
        },

        handleKeyDown: function(e) {
            var game = this.game;

            switch (e.key) {
                case 'Escape':
                    if (game.state === 'playing') {
                        if (game.placingTower) {
                            game.placingTower = null;
                        } else {
                            game.togglePause();
                        }
                    } else if (game.state === 'paused') {
                        game.togglePause();
                    }
                    break;

                case 'q':
                case 'Q':
                    if (game.state === 'playing' && game.hero) {
                        game.hero.useActive(game);
                    }
                    break;

                case '1':
                    if (game.state === 'playing') game.setSpeed(0);
                    break;
                case '2':
                    if (game.state === 'playing') game.setSpeed(1);
                    break;
                case '3':
                    if (game.state === 'playing') game.setSpeed(2);
                    break;

                case ' ':
                    e.preventDefault();
                    if (game.state === 'playing') {
                        game.startNextWave();
                    }
                    break;

                case 'u':
                case 'U':
                    if (game.state === 'playing' && game.selectedTower) {
                        game.upgradeTower(game.selectedTower);
                    }
                    break;

                case 's':
                case 'S':
                    if (game.state === 'playing' && game.selectedTower) {
                        game.sellTower(game.selectedTower);
                    }
                    break;

                case 'm':
                case 'M':
                    game.toggleMute();
                    break;
            }
        }
    };
})();
