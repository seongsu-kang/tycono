(function() {
    'use strict';
    var S = window.Sentinel;

    // ================================================
    // Game Class — Core game logic
    // ================================================
    function Game() {
        // State
        this.state = 'menu'; // menu, mapSelect, difficultySelect, howToPlay, credits, playing, paused, gameover, victory
        this.paused = false;
        this.speedIndex = 0; // 0=1x, 1=2x, 2=3x
        this.muted = S.SaveSystem.isMuted();

        // Map / Difficulty
        this.selectedMapId = null;
        this.mapData = null;
        this.difficulty = 'normal';
        this.diffSettings = null;

        // Game entities
        this.towers = [];
        this.enemies = [];
        this.projectiles = [];
        this.hero = null;
        this.waveManager = null;
        this.particles = new S.ParticleSystem();

        // Game state
        this.gold = 0;
        this.lives = 0;
        this.maxLives = 0;
        this.killCount = 0;
        this.towerCount = 0;
        this.totalGoldEarned = 0;
        this.playTime = 0;
        this.unlockMessage = null;

        // UI state
        this.selectedTower = null;
        this.placingTower = null;
        this.mouseCell = null;
        this.activeSynergies = [];

        // Pixel paths (computed from map waypoints)
        this.pixelPaths = [];

        // Menu animation
        this.menuTimer = 0;

        // Audio init
        if (!this.muted) {
            S.audio = new S.AudioManager();
        }
    }

    // ---- State Management ----

    Game.prototype.setState = function(newState) {
        this.state = newState;
        this.paused = false;

        if (newState === 'menu') {
            this.menuTimer = 0;
            this.cleanup();
        }
    };

    Game.prototype.cleanup = function() {
        this.towers = [];
        this.enemies = [];
        this.projectiles = [];
        this.hero = null;
        this.waveManager = null;
        this.particles = new S.ParticleSystem();
        this.selectedTower = null;
        this.placingTower = null;
        this.activeSynergies = [];
        S.Effects.clear();
    };

    // ---- Game Start ----

    Game.prototype.startGame = function(mapId, difficulty) {
        this.cleanup();

        this.selectedMapId = mapId;
        this.difficulty = difficulty;
        this.diffSettings = S.DIFFICULTY[difficulty.toUpperCase()];

        // Load map
        var rawMap = S.data.maps[mapId];
        this.mapData = {
            id: rawMap.id,
            name: rawMap.name,
            grid: [],
            paths: rawMap.paths,
            theme: rawMap.theme,
            cols: rawMap.grid[0].length,
            rows: rawMap.grid.length,
            cellSize: 0,
            offsetX: 0,
            offsetY: 0
        };

        // Deep copy grid
        for (var r = 0; r < rawMap.grid.length; r++) {
            this.mapData.grid.push(rawMap.grid[r].slice());
        }

        // Calculate cell size and offset
        var csX = Math.floor(S.GAME_BOARD_WIDTH / this.mapData.cols);
        var csY = Math.floor(S.GAME_BOARD_HEIGHT / this.mapData.rows);
        this.mapData.cellSize = Math.min(csX, csY);

        var totalW = this.mapData.cols * this.mapData.cellSize;
        var totalH = this.mapData.rows * this.mapData.cellSize;
        this.mapData.offsetX = S.GAME_BOARD_X + Math.floor((S.GAME_BOARD_WIDTH - totalW) / 2);
        this.mapData.offsetY = S.GAME_BOARD_Y + Math.floor((S.GAME_BOARD_HEIGHT - totalH) / 2);

        // Build pixel paths
        this.pixelPaths = [];
        for (var p = 0; p < rawMap.paths.length; p++) {
            this.pixelPaths.push(S.PathSystem.buildPath(rawMap.paths[p], this.mapData));
        }

        // Game state
        this.gold = this.diffSettings.startGold;
        this.lives = this.diffSettings.startLives;
        this.maxLives = this.diffSettings.startLives;
        this.killCount = 0;
        this.towerCount = 0;
        this.totalGoldEarned = this.diffSettings.startGold;
        this.playTime = 0;
        this.unlockMessage = null;
        this.speedIndex = 0;

        // Hero
        this.hero = new S.Hero('kael', this);

        // Wave manager
        this.waveManager = new S.WaveManager(this);

        // State
        this.state = 'playing';
        this.paused = false;
    };

    // ---- Update ----

    Game.prototype.update = function(dt) {
        if (this.state === 'menu') {
            this.menuTimer += dt;
            return;
        }

        if (this.state !== 'playing' || this.paused) return;

        // Apply speed multiplier
        var speedMult = S.SPEED_MULTIPLIERS[this.speedIndex];
        var gameDt = dt * speedMult;

        this.playTime += gameDt;

        // Reset tower buffs each frame
        for (var i = 0; i < this.towers.length; i++) {
            this.towers[i].resetBuffs();
        }

        // Update synergies (apply buffs)
        this.activeSynergies = S.SynergySystem.calculate(this.towers, this.mapData);

        // Update hero (applies passive buffs)
        if (this.hero) {
            this.hero.update(gameDt, this);
        }

        // Update towers
        for (var i = 0; i < this.towers.length; i++) {
            this.towers[i].update(gameDt, this);
        }

        // Update wave manager (spawns enemies)
        if (this.waveManager) {
            this.waveManager.update(gameDt);
        }

        // Update enemies
        for (var i = this.enemies.length - 1; i >= 0; i--) {
            var enemy = this.enemies[i];
            enemy.update(gameDt, this);

            if (enemy.reachedEnd) {
                this.loseLife(enemy.lifeCost);
                this.enemies.splice(i, 1);
            } else if (enemy.isDead) {
                // Keep dead enemies briefly for death animation, then remove
                enemy.deathTimer = (enemy.deathTimer || 0) + gameDt;
                if (enemy.deathTimer > 0.5) {
                    this.enemies.splice(i, 1);
                }
            }
        }

        // Update projectiles
        for (var i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update(gameDt, this);
            if (this.projectiles[i].dead) {
                this.projectiles.splice(i, 1);
            }
        }

        // Update particles
        this.particles.update(gameDt);

        // Update effects
        S.Effects.update(gameDt);
    };

    // ---- Tower Management ----

    Game.prototype.canPlaceTower = function(col, row) {
        var grid = this.mapData.grid;
        if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return false;
        if (grid[row][col] !== 0) return false;
        if (this.getTowerAt(col, row)) return false;
        return true;
    };

    Game.prototype.getTowerAt = function(col, row) {
        for (var i = 0; i < this.towers.length; i++) {
            if (this.towers[i].gridCol === col && this.towers[i].gridRow === row) {
                return this.towers[i];
            }
        }
        return null;
    };

    Game.prototype.placeTower = function(col, row, towerId) {
        var cost = S.Economy.getTowerCost(towerId);
        if (this.gold < cost) return false;

        var tower = new S.Tower(towerId, col, row, this);
        this.towers.push(tower);
        this.gold -= cost;
        this.towerCount++;
        this.placingTower = null;

        if (S.audio) S.audio.playTowerPlace();

        // Recalculate synergies
        this.activeSynergies = S.SynergySystem.calculate(this.towers, this.mapData);

        return true;
    };

    Game.prototype.upgradeTower = function(tower) {
        if (!tower || tower.tier >= 4) return false;

        var nextTier = tower.tier + 1;
        var tierData = S.data.towers[tower.type].tiers[nextTier];
        if (!tierData) return false;

        var cost = tierData.cost;
        if (this.gold < cost) {
            if (S.audio) S.audio.playError();
            return false;
        }

        this.gold -= cost;
        tower.upgrade();

        if (S.audio) S.audio.playTowerUpgrade();

        // Recalculate synergies
        this.activeSynergies = S.SynergySystem.calculate(this.towers, this.mapData);

        return true;
    };

    Game.prototype.sellTower = function(tower) {
        if (!tower) return;

        var sellPrice = S.Economy.getSellPrice(tower.totalInvested);
        this.gold += sellPrice;

        // Remove from array
        var idx = this.towers.indexOf(tower);
        if (idx !== -1) this.towers.splice(idx, 1);

        if (this.selectedTower === tower) {
            this.selectedTower = null;
        }

        if (S.audio) S.audio.playTowerSell();

        // Recalculate synergies
        this.activeSynergies = S.SynergySystem.calculate(this.towers, this.mapData);

        // Sell particles
        this.particles.emit(tower.x, tower.y, 8, {
            colors: [S.COLORS.GOLD_YELLOW, '#ffcc00'],
            minSpeed: 30, maxSpeed: 80,
            minLife: 0.3, maxLife: 0.6,
            minSize: 2, maxSize: 4
        });
    };

    Game.prototype.selectTower = function(tower) {
        this.selectedTower = tower;
        this.placingTower = null;
    };

    Game.prototype.deselectTower = function() {
        this.selectedTower = null;
    };

    // ---- Gold ----

    Game.prototype.addGold = function(amount, x, y) {
        var adjusted = Math.floor(amount * this.diffSettings.rewardMultiplier);
        this.gold += adjusted;
        this.totalGoldEarned += adjusted;

        if (x !== undefined && y !== undefined) {
            S.Effects.add(new S.GoldPopup(x, y, adjusted));
        }

        if (S.audio) S.audio.playGoldPickup();
    };

    // ---- Lives ----

    Game.prototype.loseLife = function(amount) {
        this.lives -= amount;
        if (S.audio) S.audio.playLifeLost();

        S.Effects.add(new S.ScreenFlash('#ff0000', 0.3));

        if (this.lives <= 0) {
            this.lives = 0;
            this.gameOver();
        }
    };

    // ---- Wave ----

    Game.prototype.startNextWave = function() {
        if (!this.waveManager) return;
        if (this.waveManager.waveInProgress) return;

        var started = this.waveManager.startWave();
        if (!started && S.audio) S.audio.playError();
    };

    Game.prototype.showWaveComplete = function(wave, bonus, interest) {
        S.Effects.add(new S.WaveCompletePopup(wave, bonus, interest));
    };

    Game.prototype.showBossWarning = function(message) {
        S.Effects.add(new S.BossWarning(message));
    };

    // ---- Speed ----

    Game.prototype.cycleSpeed = function() {
        this.speedIndex = (this.speedIndex + 1) % S.SPEED_MULTIPLIERS.length;
    };

    Game.prototype.setSpeed = function(index) {
        if (index >= 0 && index < S.SPEED_MULTIPLIERS.length) {
            this.speedIndex = index;
        }
    };

    // ---- Pause / Mute ----

    Game.prototype.togglePause = function() {
        if (this.state === 'playing') {
            this.paused = true;
            this.state = 'paused';
        } else if (this.state === 'paused') {
            this.paused = false;
            this.state = 'playing';
        }
    };

    Game.prototype.toggleMute = function() {
        this.muted = !this.muted;
        S.SaveSystem.setMuted(this.muted);

        if (this.muted) {
            S.audio = null;
        } else {
            S.audio = new S.AudioManager();
        }
    };

    // ---- Game End ----

    Game.prototype.gameOver = function() {
        this.state = 'gameover';
        S.SaveSystem.recordGame(false);
        if (S.audio) S.audio.playGameOver();
    };

    Game.prototype.victory = function() {
        this.state = 'victory';

        var stars = this.getStarRating();
        S.SaveSystem.recordGame(true);
        S.SaveSystem.setMapStars(this.mapData.id, this.difficulty, stars);

        // Unlock next map
        var mapOrder = S.data.mapOrder;
        var currentIdx = mapOrder.indexOf(this.mapData.id);
        if (currentIdx !== -1 && currentIdx < mapOrder.length - 1) {
            var nextMapId = mapOrder[currentIdx + 1];
            if (!S.SaveSystem.isMapUnlocked(nextMapId)) {
                S.SaveSystem.unlockMap(nextMapId);
                var nextMap = S.data.maps[nextMapId];
                this.unlockMessage = 'New map unlocked: ' + (nextMap ? nextMap.name : nextMapId);
            }
        }

        if (S.audio) S.audio.playVictory();
    };

    Game.prototype.getStarRating = function() {
        var pct = this.lives / this.maxLives;
        if (pct >= 1) return 3;
        if (pct >= 0.5) return 2;
        return 1;
    };

    Game.prototype.goToNextMap = function() {
        var mapOrder = S.data.mapOrder;
        var currentIdx = mapOrder.indexOf(this.mapData.id);
        if (currentIdx !== -1 && currentIdx < mapOrder.length - 1) {
            var nextMapId = mapOrder[currentIdx + 1];
            this.startGame(nextMapId, this.difficulty);
        } else {
            this.setState('mapSelect');
        }
    };

    // ================================================
    // Game Loop
    // ================================================

    var game = null;
    var lastTime = 0;

    function gameLoop(timestamp) {
        if (!lastTime) lastTime = timestamp;
        var dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        // Clamp dt to prevent spiral of death
        if (dt > 0.1) dt = 0.1;

        // Update
        game.update(dt);

        // Render
        if (game.state === 'menu' || game.state === 'mapSelect' ||
            game.state === 'difficultySelect' || game.state === 'howToPlay' ||
            game.state === 'credits') {
            S.Renderer.renderMenu(game);
        } else {
            S.Renderer.renderGame(game);

            // Overlay modals
            if (game.state === 'paused') {
                S.Modal.renderPause(S.Renderer.ctx);
            } else if (game.state === 'gameover') {
                S.Modal.renderGameOver(S.Renderer.ctx, game);
            } else if (game.state === 'victory') {
                S.Modal.renderVictory(S.Renderer.ctx, game);
            }
        }

        requestAnimationFrame(gameLoop);
    }

    // ================================================
    // Init
    // ================================================

    function init() {
        var canvas = document.getElementById('gameCanvas');
        if (!canvas) {
            console.error('Sentinel: Canvas element not found!');
            return;
        }

        // Init renderer
        S.Renderer.init(canvas);

        // Create game
        game = new Game();
        S.game = game;

        // Init input
        S.Input.init(canvas, game);

        // Start loop
        requestAnimationFrame(gameLoop);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    S.Game = Game;
})();
