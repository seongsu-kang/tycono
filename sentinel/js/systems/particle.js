(function() {
    'use strict';
    var S = window.Sentinel;

    function Particle(x, y, opts) {
        this.x = x;
        this.y = y;
        this.vx = opts.vx || 0;
        this.vy = opts.vy || 0;
        this.life = 0;
        this.maxLife = opts.maxLife || 0.5;
        this.color = opts.color || '#ffffff';
        this.size = opts.size || 3;
        this.sizeDecay = opts.sizeDecay !== undefined ? opts.sizeDecay : true;
        this.gravity = opts.gravity || 0;
        this.alpha = 1;
        this.dead = false;
    }

    Particle.prototype.update = function(dt) {
        this.life += dt;
        if (this.life >= this.maxLife) {
            this.dead = true;
            return;
        }
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += this.gravity * dt;
        var progress = this.life / this.maxLife;
        this.alpha = 1 - progress;
        if (this.sizeDecay) {
            this.size *= (1 - dt * 2);
        }
    };

    Particle.prototype.render = function(ctx) {
        if (this.dead) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    // Particle Manager
    function ParticleSystem() {
        this.particles = [];
    }

    ParticleSystem.prototype.update = function(dt) {
        for (var i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].dead) {
                this.particles.splice(i, 1);
            }
        }
    };

    ParticleSystem.prototype.render = function(ctx) {
        for (var i = 0; i < this.particles.length; i++) {
            this.particles[i].render(ctx);
        }
    };

    ParticleSystem.prototype.emit = function(x, y, count, opts) {
        for (var i = 0; i < count; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = (opts.minSpeed || 20) + Math.random() * ((opts.maxSpeed || 80) - (opts.minSpeed || 20));
            var p = new Particle(x, y, {
                vx: Math.cos(angle) * speed + (opts.vx || 0),
                vy: Math.sin(angle) * speed + (opts.vy || 0),
                maxLife: (opts.minLife || 0.2) + Math.random() * ((opts.maxLife || 0.6) - (opts.minLife || 0.2)),
                color: opts.colors ? opts.colors[Math.floor(Math.random() * opts.colors.length)] : (opts.color || '#ffffff'),
                size: (opts.minSize || 2) + Math.random() * ((opts.maxSize || 5) - (opts.minSize || 2)),
                sizeDecay: opts.sizeDecay !== undefined ? opts.sizeDecay : true,
                gravity: opts.gravity || 0
            });
            this.particles.push(p);
        }
    };

    // Preset effects
    ParticleSystem.prototype.explosion = function(x, y, color) {
        this.emit(x, y, 12, {
            colors: [color, S.Utils.lightenColor(color), '#ffffff'],
            minSpeed: 30, maxSpeed: 120,
            minLife: 0.2, maxLife: 0.5,
            minSize: 2, maxSize: 5
        });
    };

    ParticleSystem.prototype.goldPopup = function(x, y) {
        this.emit(x, y, 5, {
            colors: [S.COLORS.GOLD_YELLOW, '#ffee88'],
            minSpeed: 10, maxSpeed: 40,
            vy: -30,
            minLife: 0.3, maxLife: 0.6,
            minSize: 1, maxSize: 3
        });
    };

    ParticleSystem.prototype.healEffect = function(x, y) {
        this.emit(x, y, 3, {
            colors: ['#55ff55', '#88ff88', '#aaffaa'],
            minSpeed: 10, maxSpeed: 30,
            vy: -40,
            minLife: 0.3, maxLife: 0.8,
            minSize: 2, maxSize: 4,
            sizeDecay: false
        });
    };

    ParticleSystem.prototype.iceEffect = function(x, y) {
        this.emit(x, y, 4, {
            colors: ['#88ddff', '#aaeeff', '#ffffff'],
            minSpeed: 15, maxSpeed: 40,
            minLife: 0.2, maxLife: 0.5,
            minSize: 1, maxSize: 3
        });
    };

    ParticleSystem.prototype.fireEffect = function(x, y) {
        this.emit(x, y, 6, {
            colors: ['#ff4400', '#ff8800', '#ffcc00'],
            minSpeed: 20, maxSpeed: 60,
            vy: -30,
            minLife: 0.2, maxLife: 0.4,
            minSize: 2, maxSize: 5
        });
    };

    ParticleSystem.prototype.lightningEffect = function(x, y) {
        this.emit(x, y, 4, {
            colors: ['#aa55ff', '#cc88ff', '#ffffff'],
            minSpeed: 30, maxSpeed: 80,
            minLife: 0.1, maxLife: 0.3,
            minSize: 1, maxSize: 3
        });
    };

    ParticleSystem.prototype.voidEffect = function(x, y) {
        this.emit(x, y, 5, {
            colors: ['#8800ff', '#5500cc', '#330088'],
            minSpeed: 10, maxSpeed: 50,
            minLife: 0.3, maxLife: 0.7,
            minSize: 2, maxSize: 6
        });
    };

    ParticleSystem.prototype.shieldEffect = function(x, y) {
        this.emit(x, y, 4, {
            colors: ['#5588cc', '#88aadd', '#aaccff'],
            minSpeed: 15, maxSpeed: 35,
            minLife: 0.3, maxLife: 0.6,
            minSize: 2, maxSize: 4
        });
    };

    S.ParticleSystem = ParticleSystem;
})();
