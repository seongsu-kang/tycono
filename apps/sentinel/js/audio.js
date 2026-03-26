// Sentinel - Audio Manager
// Web Audio API 기반 프로그래매틱 사운드

(function() {
    'use strict';

    class AudioManager {
        constructor() {
            this.context = null;
            this.enabled = true;
            this.masterVolume = 0.3;
            this.init();
        }

        init() {
            try {
                this.context = new (window.AudioContext || window.webkitAudioContext)();
                console.log('[AudioManager] Audio context initialized');
            } catch (e) {
                console.warn('[AudioManager] Web Audio API not supported');
                this.enabled = false;
            }
        }

        playTone(frequency, duration, type, volume) {
            if (!this.enabled || !this.context) return;

            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.type = type || 'sine';
            oscillator.frequency.value = frequency;

            gainNode.gain.value = (volume || 1) * this.masterVolume;
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator.start(this.context.currentTime);
            oscillator.stop(this.context.currentTime + duration);
        }

        playShoot() {
            this.playTone(800, 0.05, 'square', 0.2);
        }

        playHit() {
            this.playTone(200, 0.1, 'sawtooth', 0.15);
        }

        playEnemyDeath() {
            this.playTone(150, 0.2, 'sawtooth', 0.2);
            setTimeout(() => this.playTone(100, 0.1, 'sawtooth', 0.15), 50);
        }

        playTowerPlace() {
            this.playTone(600, 0.1, 'sine', 0.3);
            setTimeout(() => this.playTone(900, 0.1, 'sine', 0.2), 80);
        }

        playUpgrade() {
            this.playTone(700, 0.1, 'sine', 0.3);
            setTimeout(() => this.playTone(1000, 0.1, 'sine', 0.25), 70);
            setTimeout(() => this.playTone(1200, 0.15, 'sine', 0.2), 140);
        }

        playWaveStart() {
            this.playTone(400, 0.15, 'triangle', 0.4);
            setTimeout(() => this.playTone(500, 0.15, 'triangle', 0.35), 100);
            setTimeout(() => this.playTone(600, 0.2, 'triangle', 0.3), 200);
        }

        playGameOver() {
            this.playTone(400, 0.3, 'sawtooth', 0.4);
            setTimeout(() => this.playTone(300, 0.3, 'sawtooth', 0.35), 200);
            setTimeout(() => this.playTone(200, 0.5, 'sawtooth', 0.3), 400);
        }

        playVictory() {
            this.playTone(500, 0.2, 'sine', 0.4);
            setTimeout(() => this.playTone(700, 0.2, 'sine', 0.35), 150);
            setTimeout(() => this.playTone(900, 0.2, 'sine', 0.3), 300);
            setTimeout(() => this.playTone(1200, 0.4, 'sine', 0.35), 450);
        }

        toggle() {
            this.enabled = !this.enabled;
            return this.enabled;
        }
    }

    Sentinel.classes.AudioManager = AudioManager;
    console.log('[Sentinel] AudioManager loaded');
})();
