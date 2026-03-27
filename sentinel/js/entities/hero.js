(function() {
    'use strict';
    var S = window.Sentinel;

    function Hero(heroId, game) {
        var data = S.data.heroes[heroId];
        this.id = heroId;
        this.data = data;
        this.name = data.name;
        this.color = data.color;

        // Position (start at map center)
        this.x = S.GAME_BOARD_X + S.GAME_BOARD_WIDTH / 2;
        this.y = S.GAME_BOARD_Y + S.GAME_BOARD_HEIGHT / 2;
        this.targetX = this.x;
        this.targetY = this.y;

        // Movement
        this.moveSpeed = data.moveSpeed;
        this.isMoving = false;

        // Attack
        this.attackDamage = data.attack.damage;
        this.attackSpeed = data.attack.attackSpeed;
        this.attackRange = data.attack.range;
        this.attackTimer = 0;
        this.target = null;
        this.angle = 0;

        // Passive
        this.passive = data.passive;

        // Active ability
        this.active = data.active;
        this.activeCooldown = 0;
        this.activeActive = false;
        this.activeTimer = 0;

        // Visual
        this.size = 14;
        this.pulseTimer = 0;
    }

    Hero.prototype.update = function(dt, game) {
        // Movement
        if (this.isMoving) {
            var dx = this.targetX - this.x;
            var dy = this.targetY - this.y;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 3) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.isMoving = false;
            } else {
                var speed = this.moveSpeed * dt;
                this.x += (dx / dist) * speed;
                this.y += (dy / dist) * speed;
                this.angle = Math.atan2(dy, dx);
            }
        }

        // Auto-attack
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
            this.target = this.findTarget(game);
            if (this.target) {
                this.attackTarget(game);
                this.attackTimer = 1.0 / this.attackSpeed;
            } else {
                this.attackTimer = 0.2;
            }
        }

        // Passive: buff nearby towers
        this.applyPassive(game);

        // Active ability
        if (this.activeActive) {
            this.activeTimer -= dt;
            if (this.activeTimer <= 0) {
                this.activeActive = false;
            }
            this.applyActiveEffect(game);
        }

        if (this.activeCooldown > 0) {
            this.activeCooldown -= dt;
        }

        this.pulseTimer += dt;
    };

    Hero.prototype.moveTo = function(px, py) {
        // Clamp to game board
        this.targetX = S.Utils.clamp(px, S.GAME_BOARD_X + 10, S.GAME_BOARD_X + S.GAME_BOARD_WIDTH - 10);
        this.targetY = S.Utils.clamp(py, S.GAME_BOARD_Y + 10, S.GAME_BOARD_Y + S.GAME_BOARD_HEIGHT - 10);
        this.isMoving = true;
    };

    Hero.prototype.findTarget = function(game) {
        var range = this.attackRange * game.mapData.cellSize;
        var enemies = game.enemies;
        var closest = null;
        var closestDist = Infinity;

        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d < closestDist && d <= range) {
                closestDist = d;
                closest = e;
            }
        }
        return closest;
    };

    Hero.prototype.attackTarget = function(game) {
        if (!this.target || this.target.isDead) return;
        this.target.takeDamage(this.attackDamage, game);
        this.angle = S.Utils.angleToTarget(this.x, this.y, this.target.x, this.target.y);

        // Visual: hero attack flash
        game.particles.emit(this.target.x, this.target.y, 3, {
            colors: [this.color, '#ffffff'],
            minSpeed: 20, maxSpeed: 50,
            minLife: 0.1, maxLife: 0.3,
            minSize: 1, maxSize: 3
        });
    };

    Hero.prototype.applyPassive = function(game) {
        // Commander Kael: +10% ATK to towers within 3 tiles
        var range = this.passive.range * game.mapData.cellSize;
        for (var i = 0; i < game.towers.length; i++) {
            var t = game.towers[i];
            var d = S.Utils.dist(this.x, this.y, t.x, t.y);
            if (d <= range) {
                t.heroBuffs.atk = Math.max(t.heroBuffs.atk, this.passive.atkBuff);
            }
        }
    };

    Hero.prototype.useActive = function(game) {
        if (this.activeCooldown > 0 || this.activeActive) return false;
        this.activeActive = true;
        this.activeTimer = this.active.duration;
        this.activeCooldown = this.active.cooldown;
        if (S.audio) S.audio.playHeroAbility();
        return true;
    };

    Hero.prototype.applyActiveEffect = function(game) {
        // Battle Cry: +25% attack speed to ALL towers
        if (this.active.spdBuff) {
            for (var i = 0; i < game.towers.length; i++) {
                game.towers[i].heroBuffs.spd = Math.max(
                    game.towers[i].heroBuffs.spd,
                    this.active.spdBuff
                );
            }
        }
    };

    Hero.prototype.render = function(ctx, game) {
        ctx.save();

        // Passive aura range indicator
        var auraRange = this.passive.range * game.mapData.cellSize;
        var auraPulse = (Math.sin(this.pulseTimer * 2) + 1) * 0.1 + 0.1;
        ctx.strokeStyle = S.Utils.colorAlpha(this.color, auraPulse);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, auraRange, 0, Math.PI * 2);
        ctx.stroke();

        // Active ability visual
        if (this.activeActive) {
            ctx.strokeStyle = S.Utils.colorAlpha('#ffcc00', 0.3 + Math.sin(this.pulseTimer * 6) * 0.2);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 30 + Math.sin(this.pulseTimer * 4) * 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Hero body (shield/warrior shape)
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;

        // Star shape for hero
        ctx.beginPath();
        for (var i = 0; i < 5; i++) {
            var outerA = Math.PI / 2.5 * i - Math.PI / 2;
            var innerA = outerA + Math.PI / 5;
            ctx.lineTo(this.x + Math.cos(outerA) * this.size, this.y + Math.sin(outerA) * this.size);
            ctx.lineTo(this.x + Math.cos(innerA) * this.size * 0.5, this.y + Math.sin(innerA) * this.size * 0.5);
        }
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;

        // Direction indicator
        if (this.target && !this.target.isDead) {
            ctx.strokeStyle = S.Utils.colorAlpha(this.color, 0.3);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(
                this.x + Math.cos(this.angle) * this.size * 1.5,
                this.y + Math.sin(this.angle) * this.size * 1.5
            );
            ctx.stroke();
        }

        // Movement target indicator
        if (this.isMoving) {
            ctx.strokeStyle = S.Utils.colorAlpha(this.color, 0.4);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.targetX, this.targetY);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Name label
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(this.name, this.x, this.y + this.size + 4);

        ctx.restore();
    };

    S.Hero = Hero;
})();
