// Sentinel - Wave Manager

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
        }

        startWave() {
            if (this.isSpawning || this.currentWave >= this.waveData.length) {
                return false;
            }

            this.currentWave++;
            this.isSpawning = true;
            this.spawnQueue = [];
            this.spawnTimer = 0;

            // 웨이브 데이터를 스폰 큐로 변환
            const wave = this.waveData[this.currentWave - 1];
            wave.enemies.forEach(group => {
                for (let i = 0; i < group.count; i++) {
                    this.spawnQueue.push({
                        type: group.type,
                        delay: i * group.interval
                    });
                }
            });

            // 타임 순서대로 정렬
            this.spawnQueue.sort((a, b) => a.delay - b.delay);

            console.log('[WaveManager] Wave', this.currentWave, 'started:', this.spawnQueue.length, 'enemies');
            return true;
        }

        startCountdown(duration) {
            this.countdown = duration;
            this.isCountingDown = true;
        }

        update(dt) {
            // 카운트다운
            if (this.isCountingDown) {
                this.countdown -= dt;
                if (this.countdown <= 0) {
                    this.isCountingDown = false;
                    this.startWave();
                }
                return;
            }

            // 스폰
            if (this.isSpawning) {
                this.spawnTimer += dt;

                // 스폰 큐에서 적 생성
                while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnTimer) {
                    const spawn = this.spawnQueue.shift();
                    const enemy = new Sentinel.classes.Enemy(spawn.type);
                    Sentinel.game.enemies.push(enemy);
                }

                // 웨이브 완료 체크
                if (this.spawnQueue.length === 0) {
                    this.isSpawning = false;
                    console.log('[WaveManager] Wave', this.currentWave, 'spawning complete');
                }
            }
        }

        isWaveComplete() {
            return !this.isSpawning && Sentinel.game.enemies.every(e => !e.active);
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
            const totalEnemies = this.waveData[this.currentWave - 1].enemies.reduce((sum, g) => sum + g.count, 0);
            const remaining = this.spawnQueue.length;
            return (totalEnemies - remaining) / totalEnemies;
        }
    }

    Sentinel.classes.WaveManager = WaveManager;
    console.log('[Sentinel] WaveManager loaded');
})();
