(function() {
    'use strict';
    var S = window.Sentinel;

    function AudioManager() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.muted = false;
        this.volume = 0.3;
        this.initialized = false;
    }

    AudioManager.prototype.init = function() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.15;
            this.musicGain.connect(this.masterGain);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.5;
            this.sfxGain.connect(this.masterGain);

            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not available');
        }
    };

    AudioManager.prototype.resume = function() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    };

    AudioManager.prototype.toggleMute = function() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.muted ? 0 : this.volume;
        }
    };

    AudioManager.prototype.playTone = function(freq, duration, type, gain, dest) {
        if (!this.initialized || this.muted) return;
        try {
            var osc = this.ctx.createOscillator();
            var g = this.ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.value = freq;
            g.gain.value = gain || 0.2;
            g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(g);
            g.connect(dest || this.sfxGain);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) { /* ignore audio errors */ }
    };

    AudioManager.prototype.playNoise = function(duration, gain, dest) {
        if (!this.initialized || this.muted) return;
        try {
            var bufferSize = this.ctx.sampleRate * duration;
            var buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            var data = buffer.getChannelData(0);
            for (var i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.5;
            }
            var source = this.ctx.createBufferSource();
            source.buffer = buffer;
            var g = this.ctx.createGain();
            g.gain.value = gain || 0.1;
            g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            source.connect(g);
            g.connect(dest || this.sfxGain);
            source.start();
        } catch (e) { /* ignore */ }
    };

    // SFX
    AudioManager.prototype.playTowerAttack = function(type) {
        if (!this.initialized) return;
        switch (type) {
            case 'arrow':
                this.playTone(800, 0.08, 'triangle', 0.1);
                this.playTone(1200, 0.05, 'sine', 0.05);
                break;
            case 'cannon':
                this.playTone(100, 0.2, 'sawtooth', 0.2);
                this.playNoise(0.15, 0.15);
                break;
            case 'slow':
                this.playTone(400, 0.15, 'sine', 0.08);
                this.playTone(600, 0.1, 'sine', 0.05);
                break;
            case 'sniper':
                this.playTone(1500, 0.05, 'square', 0.08);
                this.playTone(2000, 0.03, 'sine', 0.06);
                break;
            case 'tesla':
                this.playTone(200, 0.1, 'sawtooth', 0.1);
                this.playTone(400, 0.08, 'square', 0.08);
                this.playNoise(0.05, 0.1);
                break;
            case 'flame':
                this.playNoise(0.2, 0.08);
                this.playTone(150, 0.15, 'sawtooth', 0.06);
                break;
            case 'void':
                this.playTone(80, 0.3, 'sine', 0.1);
                this.playTone(120, 0.2, 'triangle', 0.08);
                break;
        }
    };

    AudioManager.prototype.playEnemyDeath = function(type) {
        if (!this.initialized) return;
        this.playTone(300, 0.1, 'square', 0.08);
        this.playTone(200, 0.15, 'sawtooth', 0.06);
    };

    AudioManager.prototype.playGoldPickup = function() {
        if (!this.initialized) return;
        this.playTone(1000, 0.05, 'sine', 0.06);
        this.playTone(1500, 0.05, 'sine', 0.04);
    };

    AudioManager.prototype.playTowerPlace = function() {
        if (!this.initialized) return;
        this.playTone(400, 0.08, 'triangle', 0.1);
        this.playTone(600, 0.06, 'sine', 0.08);
    };

    AudioManager.prototype.playTowerUpgrade = function() {
        if (!this.initialized) return;
        this.playTone(500, 0.06, 'sine', 0.1);
        this.playTone(700, 0.06, 'sine', 0.08);
        this.playTone(900, 0.1, 'sine', 0.06);
    };

    AudioManager.prototype.playTowerSell = function() {
        if (!this.initialized) return;
        this.playTone(600, 0.06, 'triangle', 0.08);
        this.playTone(400, 0.08, 'triangle', 0.06);
    };

    AudioManager.prototype.playWaveStart = function() {
        if (!this.initialized) return;
        this.playTone(300, 0.15, 'sawtooth', 0.12);
        this.playTone(400, 0.15, 'sawtooth', 0.1);
        this.playTone(500, 0.2, 'sawtooth', 0.08);
    };

    AudioManager.prototype.playBossWarning = function() {
        if (!this.initialized) return;
        for (var i = 0; i < 3; i++) {
            setTimeout((function(idx) {
                return function() {
                    this.playTone(100, 0.3, 'sawtooth', 0.15);
                    this.playNoise(0.2, 0.12);
                }.bind(this);
            }.bind(this))(i), i * 400);
        }
    };

    AudioManager.prototype.playLifeLost = function() {
        if (!this.initialized) return;
        this.playTone(200, 0.2, 'sawtooth', 0.15);
        this.playTone(150, 0.3, 'square', 0.1);
    };

    AudioManager.prototype.playVictory = function() {
        if (!this.initialized) return;
        var notes = [523, 659, 784, 1047];
        for (var i = 0; i < notes.length; i++) {
            setTimeout((function(freq) {
                return function() { this.playTone(freq, 0.3, 'sine', 0.1); }.bind(this);
            }.bind(this))(notes[i]), i * 150);
        }
    };

    AudioManager.prototype.playGameOver = function() {
        if (!this.initialized) return;
        this.playTone(200, 0.5, 'sawtooth', 0.12);
        this.playTone(100, 0.8, 'sine', 0.1);
    };

    AudioManager.prototype.playUIClick = function() {
        if (!this.initialized) return;
        this.playTone(800, 0.04, 'sine', 0.06);
    };

    AudioManager.prototype.playError = function() {
        if (!this.initialized) return;
        this.playTone(200, 0.1, 'square', 0.1);
    };

    AudioManager.prototype.playHeroAbility = function() {
        if (!this.initialized) return;
        this.playTone(600, 0.1, 'triangle', 0.12);
        this.playTone(800, 0.1, 'sine', 0.1);
        this.playTone(1000, 0.15, 'sine', 0.08);
    };

    S.AudioManager = AudioManager;
})();
