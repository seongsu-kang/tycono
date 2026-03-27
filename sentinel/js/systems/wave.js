(function() {
    'use strict';
    var S = window.Sentinel;

    function WaveManager(game) {
        this.game = game;
        this.currentWave = 0; // 1-indexed when active
        this.totalWaves = 15;
        this.waveInProgress = false;
        this.waveTimer = 0;
        this.spawnQueue = [];
        this.allSpawned = false;
        this.bossWarningShown = false;
        this.bossWarningData = null;
    }

    WaveManager.prototype.startWave = function() {
        if (this.waveInProgress) return false;
        if (this.currentWave >= this.totalWaves) return false;

        this.currentWave++;
        this.waveInProgress = true;
        this.waveTimer = 0;
        this.allSpawned = false;
        this.bossWarningShown = false;

        // Get wave data
        var mapId = this.game.mapData.id;
        var waves = S.data.waves[mapId];
        var waveData = waves[this.currentWave - 1];

        // Build spawn queue
        this.spawnQueue = [];
        this.bossWarningData = waveData.bossWarning || null;

        for (var i = 0; i < waveData.spawns.length; i++) {
            var spawn = waveData.spawns[i];
            for (var j = 0; j < spawn.count; j++) {
                this.spawnQueue.push({
                    time: spawn.time + j * spawn.interval,
                    type: spawn.type,
                    spawned: false
                });
            }
        }

        // Sort by time
        this.spawnQueue.sort(function(a, b) { return a.time - b.time; });

        // Play wave start sound
        if (S.audio) S.audio.playWaveStart();

        return true;
    };

    WaveManager.prototype.update = function(dt) {
        if (!this.waveInProgress) return;

        this.waveTimer += dt;

        // Boss warning
        if (this.bossWarningData && !this.bossWarningShown && this.waveTimer >= this.bossWarningData.time) {
            this.bossWarningShown = true;
            this.game.showBossWarning(this.bossWarningData.message);
            if (S.audio) S.audio.playBossWarning();
        }

        // Spawn enemies
        var allDone = true;
        for (var i = 0; i < this.spawnQueue.length; i++) {
            var sq = this.spawnQueue[i];
            if (sq.spawned) continue;
            if (this.waveTimer >= sq.time) {
                this.spawnEnemy(sq.type);
                sq.spawned = true;
            } else {
                allDone = false;
            }
        }

        if (allDone && !this.allSpawned) {
            this.allSpawned = true;
        }

        // Check wave complete: all spawned + no living enemies
        if (this.allSpawned) {
            var anyAlive = false;
            for (var e = 0; e < this.game.enemies.length; e++) {
                var enemy = this.game.enemies[e];
                if (!enemy.isDead && !enemy.reachedEnd) {
                    anyAlive = true;
                    break;
                }
            }
            if (!anyAlive) {
                this.completeWave();
            }
        }
    };

    WaveManager.prototype.spawnEnemy = function(type) {
        var game = this.game;
        var pathIndex = S.PathSystem.getRandomPathIndex(game.pixelPaths);
        var enemy = new S.Enemy(type, pathIndex, game);

        // Set initial position at path start
        var startPos = game.pixelPaths[pathIndex][0];
        enemy.x = startPos.x;
        enemy.y = startPos.y;
        enemy.distanceTraveled = 0;

        game.enemies.push(enemy);
    };

    WaveManager.prototype.completeWave = function() {
        this.waveInProgress = false;

        var game = this.game;
        var mapId = game.mapData.id;
        var waves = S.data.waves[mapId];
        var waveData = waves[this.currentWave - 1];

        // Wave bonus gold
        var bonus = waveData.bonus;
        game.addGold(bonus, S.CANVAS_WIDTH / 2, S.GAME_BOARD_Y + 30);

        // Interest
        var interest = S.Economy.getInterest(game.gold, game.difficulty);
        if (interest > 0) {
            game.gold += interest;
        }

        // Show wave complete message
        game.showWaveComplete(this.currentWave, bonus, interest);

        // Check victory
        if (this.currentWave >= this.totalWaves) {
            game.victory();
        }
    };

    WaveManager.prototype.getNextWavePreview = function() {
        if (this.currentWave >= this.totalWaves) return null;

        var mapId = this.game.mapData.id;
        var waves = S.data.waves[mapId];
        var nextWave = waves[this.currentWave]; // currentWave is 0-indexed for next

        if (!nextWave) return null;

        // Count enemies by type
        var preview = {};
        for (var i = 0; i < nextWave.spawns.length; i++) {
            var sp = nextWave.spawns[i];
            preview[sp.type] = (preview[sp.type] || 0) + sp.count;
        }
        return preview;
    };

    S.WaveManager = WaveManager;
})();
