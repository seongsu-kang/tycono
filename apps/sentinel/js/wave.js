// Sentinel - Wave Manager (폴리싱 버전 — 카운트다운 비주얼)

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
            if (this.isSpawning || this.currentWave >= this.waveData.length) {
                return false;
            }

            this.currentWave++;
            this.isSpawning = true;
            this.spawnQueue = [];
            this.spawnTimer = 0;

            var wave = this.waveData[this.currentWave - 1];
            wave.enemies.forEach(function(group) {
                for (var i = 0; i < group.count; i++) {
                    this.spawnQueue.push({
                        type: group.type,
                        delay: i * group.interval
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

            // 첫 번째 카운트다운 숫자 표시
            if (Sentinel.game) {
                Sentinel.game.showCountdownNumber(String(this.lastCountdownSecond));
            }
        }

        update(dt) {
            if (this.isCountingDown) {
                this.countdown -= dt;

                // 매 초마다 카운트다운 숫자 표시
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
                    if (Sentinel.game) {
                        Sentinel.game.showCountdownNumber('GO!');
                    }
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

                    if (spawn.type === 'boss') {
                        var config = Sentinel.config;
                        Sentinel.game.effects.push({
                            type: 'boss-warning',
                            x: config.gameWidth / 2,
                            y: config.gameHeight / 2,
                            color: Sentinel.colors.dangerRed,
                            text: '⚠ BOSS INCOMING!',
                            duration: 2.0,
                            elapsed: 0
                        });
                    }
                }

                if (this.spawnQueue.length === 0) {
                    this.isSpawning = false;
                }
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

        hasNextWave() {
            return this.currentWave < this.waveData.length;
        }

        getWaveProgress() {
            if (!this.isSpawning) return 1;
            var totalEnemies = this.waveData[this.currentWave - 1].enemies.reduce(function(sum, g) { return sum + g.count; }, 0);
            var remaining = this.spawnQueue.length;
            return (totalEnemies - remaining) / totalEnemies;
        }
    }

    Sentinel.classes.WaveManager = WaveManager;
})();
