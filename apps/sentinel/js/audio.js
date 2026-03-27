// Sentinel - Audio Manager (폴리싱 버전 — 풍성한 BGM)

(function() {
    'use strict';

    class AudioManager {
        constructor() {
            this.context = null;
            this.enabled = true;
            this.masterVolume = 0.3;
            this.bgmNodes = [];
            this.bgmPlaying = false;
            this.init();
        }

        init() {
            try {
                this.context = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('[AudioManager] Web Audio API not supported');
                this.enabled = false;
            }
        }

        ensureContext() {
            if (this.context && this.context.state === 'suspended') {
                this.context.resume();
            }
        }

        playTone(frequency, duration, type, volume) {
            if (!this.enabled || !this.context) return;
            this.ensureContext();

            var oscillator = this.context.createOscillator();
            var gainNode = this.context.createGain();

            oscillator.type = type || 'sine';
            oscillator.frequency.value = frequency;
            gainNode.gain.value = (volume || 1) * this.masterVolume;
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);
            oscillator.start(this.context.currentTime);
            oscillator.stop(this.context.currentTime + duration);
        }

        playShoot() { this.playTone(800, 0.05, 'square', 0.15); }
        playHit() { this.playTone(200, 0.1, 'sawtooth', 0.1); }

        playEnemyDeath() {
            this.playTone(150, 0.2, 'sawtooth', 0.15);
            var self = this;
            setTimeout(function() { self.playTone(100, 0.1, 'sawtooth', 0.1); }, 50);
        }

        playTowerPlace() {
            this.playTone(600, 0.1, 'sine', 0.25);
            var self = this;
            setTimeout(function() { self.playTone(900, 0.1, 'sine', 0.2); }, 80);
        }

        playUpgrade() {
            this.playTone(700, 0.1, 'sine', 0.25);
            var self = this;
            setTimeout(function() { self.playTone(1000, 0.1, 'sine', 0.2); }, 70);
            setTimeout(function() { self.playTone(1200, 0.15, 'sine', 0.15); }, 140);
        }

        playWaveStart() {
            this.playTone(400, 0.15, 'triangle', 0.3);
            var self = this;
            setTimeout(function() { self.playTone(500, 0.15, 'triangle', 0.25); }, 100);
            setTimeout(function() { self.playTone(600, 0.2, 'triangle', 0.2); }, 200);
        }

        playGameOver() {
            this.playTone(400, 0.3, 'sawtooth', 0.3);
            var self = this;
            setTimeout(function() { self.playTone(300, 0.3, 'sawtooth', 0.25); }, 200);
            setTimeout(function() { self.playTone(200, 0.5, 'sawtooth', 0.2); }, 400);
        }

        playVictory() {
            this.playTone(500, 0.2, 'sine', 0.3);
            var self = this;
            setTimeout(function() { self.playTone(700, 0.2, 'sine', 0.25); }, 150);
            setTimeout(function() { self.playTone(900, 0.2, 'sine', 0.2); }, 300);
            setTimeout(function() { self.playTone(1200, 0.4, 'sine', 0.25); }, 450);
        }

        startBGM() {
            if (!this.enabled || !this.context || this.bgmPlaying) return;
            this.ensureContext();

            var ctx = this.context;
            var now = ctx.currentTime;

            // Layer 1: Deep bass drone (55Hz)
            var bass = ctx.createOscillator();
            var bassGain = ctx.createGain();
            bass.type = 'sine';
            bass.frequency.value = 55;
            bassGain.gain.value = 0.04;
            bass.connect(bassGain);
            bassGain.connect(ctx.destination);
            bass.start(now);

            // Layer 2: Pad (subtle chord — C minor)
            var pad1 = ctx.createOscillator();
            var pad1Gain = ctx.createGain();
            pad1.type = 'sine';
            pad1.frequency.value = 131; // C3
            pad1Gain.gain.value = 0.02;
            pad1.connect(pad1Gain);
            pad1Gain.connect(ctx.destination);
            pad1.start(now);

            var pad2 = ctx.createOscillator();
            var pad2Gain = ctx.createGain();
            pad2.type = 'sine';
            pad2.frequency.value = 156; // Eb3
            pad2Gain.gain.value = 0.015;
            pad2.connect(pad2Gain);
            pad2Gain.connect(ctx.destination);
            pad2.start(now);

            var pad3 = ctx.createOscillator();
            var pad3Gain = ctx.createGain();
            pad3.type = 'sine';
            pad3.frequency.value = 196; // G3
            pad3Gain.gain.value = 0.015;
            pad3.connect(pad3Gain);
            pad3Gain.connect(ctx.destination);
            pad3.start(now);

            // Layer 3: LFO for subtle movement
            var lfo = ctx.createOscillator();
            var lfoGain = ctx.createGain();
            lfo.type = 'sine';
            lfo.frequency.value = 0.2; // very slow modulation
            lfoGain.gain.value = 5;
            lfo.connect(lfoGain);
            lfoGain.connect(bass.frequency);
            lfo.start(now);

            this.bgmNodes = [bass, pad1, pad2, pad3, lfo];
            this.bgmGains = [bassGain, pad1Gain, pad2Gain, pad3Gain];
            this.bgmPlaying = true;
        }

        stopBGM() {
            if (this.bgmNodes.length > 0) {
                this.bgmNodes.forEach(function(node) {
                    try { node.stop(); } catch(e) {}
                });
                this.bgmNodes = [];
                this.bgmGains = [];
                this.bgmPlaying = false;
            }
        }

        toggle() {
            this.enabled = !this.enabled;
            if (!this.enabled) {
                this.stopBGM();
            } else if (Sentinel.game && Sentinel.game.gameState === 'playing') {
                this.startBGM();
            }
            return this.enabled;
        }
    }

    Sentinel.classes.AudioManager = AudioManager;
})();
