// Sentinel - Wave Manager (startDelay 지원)

(function() {
    'use strict';

    class WaveManager {
        constructor() {
            this.currentWave = 0;
            this.waveData = Sentinel.data.waves;
            this.isSpawning = false;
            this.spawnQueue = [];
            this.spawnTimer = 0;
            this.countdown = 0;
            this.isCountingDown = false;
            this.lastCountdownSecond = 0;
        }

        startWave() {
            if (this.isSpawning || this.currentWave >= this.waveData.length) return false;

            this.currentWave++;
            this.isSpawning = true;
            this.spawnQueue = [];
            this.spawnTimer = 0;

            var wave = this.waveData[this.currentWave - 1];
            wave.enemies.forEach(function(group) {
                var startDelay = group.startDelay || 0;
                for (var i = 0; i < group.count; i++) {
                    this.spawnQueue.push({
                        type: group.type,
                        delay: startDelay + i * group.interval
                    });
                }
            }.bind(this));

            this.spawnQueue.sort(function(a, b) { return a.delay - b.delay; });
            return true;
        }

        startCountdown(duration) {
            this.countdown = duration;
            this.isCountingDown = true;
            this.lastCountdownSecond = Math.ceil(duration);
            if (Sentinel.game) {
                Sentinel.game.showCountdownNumber(String(this.lastCountdownSecond));
            }
        }

        update(dt) {
            if (this.isCountingDown) {
                this.countdown -= dt;
                var currentSecond = Math.ceil(this.countdown);
                if (currentSecond > 0 && currentSecond < this.lastCountdownSecond) {
                    this.lastCountdownSecond = currentSecond;
                    if (Sentinel.game) {
                        Sentinel.game.showCountdownNumber(String(currentSecond));
                        Sentinel.managers.audio.playTone(300 + currentSecond * 100, 0.1, 'sine', 0.2);
                    }
                }
                if (this.countdown <= 0) {
                    this.isCountingDown = false;
                    if (Sentinel.game) Sentinel.game.showCountdownNumber('GO!');
                    this.startWave();
                }
                return;
            }

            if (this.isSpawning) {
                this.spawnTimer += dt;
                while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnTimer) {
                    var spawn = this.spawnQueue.shift();
                    var enemy = new Sentinel.classes.Enemy(spawn.type);
                    Sentinel.game.enemies.push(enemy);

                    // Boss 등장 경고
                    if (spawn.type === 'boss') {
                        Sentinel.game.showBossWarning();
                    }
                }
                if (this.spawnQueue.length === 0) this.isSpawning = false;
            }
        }

        isWaveComplete() {
            if (this.currentWave === 0) return false;
            return !this.isSpawning && Sentinel.game.enemies.length === 0;
        }

        getCurrentWaveBonus() {
            if (this.currentWave > 0 && this.currentWave <= this.waveData.length) {
                return this.waveData[this.currentWave - 1].bonus;
            }
            return 0;
        }

        hasNextWave() { return this.currentWave < this.waveData.length; }
    }

    Sentinel.classes.WaveManager = WaveManager;
})();
