(function() {
    'use strict';
    var S = window.Sentinel;

    function Enemy(type, pathIndex, game) {
        var data = S.data.enemies[type];
        var diff = S.DIFFICULTY[game.difficulty];

        this.type = type;
        this.name = data.name;
        this.baseHp = Math.round(data.hp * diff.hpMult);
        this.hp = this.baseHp;
        this.maxHp = this.baseHp;
        this.baseSpeed = data.speed * diff.spdMult;
        this.speed = this.baseSpeed;
        this.reward = Math.round(data.reward * diff.rewardMult);
        this.lifeCost = data.lifeCost;
        this.physResist = data.physResist;
        this.color = data.color;
        this.size = data.size;
        this.shape = data.shape;
        this.special = data.special;

        // Position
        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.pathIndex = pathIndex || 0;
        this.distanceTraveled = 0;

        // State
        this.isDead = false;
        this.reachedEnd = false;
        this.effects = []; // active effects: slow, stun, dot, shield
        this.shield = 0;

        // Visual state
        this.hitFlash = 0;
        this.deathTimer = -1;
        this.spawnTimer = 0.3; // fade in

        // Special ability state
        this.specialTimer = 0;
        this.isBerserk = false;
        this.isBoss = data.isBoss || false;

        // Healer
        if (data.healRange) this.healRange = data.healRange;
        if (data.healPerSec) this.healPerSec = data.healPerSec;

        // Berserker
        if (data.berserkThreshold) this.berserkThreshold = data.berserkThreshold;
        if (data.berserkSpeedMult) this.berserkSpeedMult = data.berserkSpeedMult;

        // Shield Bearer
        if (data.shieldAmount) this.shieldAmount = data.shieldAmount;
        if (data.shieldRange) this.shieldRange = data.shieldRange;
        if (data.shieldCooldown) {
            this.shieldCooldown = data.shieldCooldown;
            this.shieldTimer = 0;
        }

        // Splitter
        if (data.splitCount) this.splitCount = data.splitCount;
        if (data.splitType) this.splitType = data.splitType;

        // Slow resistance
        this.slowResistance = data.slowResistance || 0;

        // Minor Boss aura
        if (data.auraRange) this.auraRange = data.auraRange;
        if (data.auraSpeedBuff) this.auraSpeedBuff = data.auraSpeedBuff;

        // Final Boss
        if (data.rageThreshold) this.rageThreshold = data.rageThreshold;
        if (data.rageSpeedMult) this.rageSpeedMult = data.rageSpeedMult;
        if (data.healAmount) this.bossHealAmount = data.healAmount;
        if (data.healInterval) {
            this.bossHealInterval = data.healInterval;
            this.bossHealTimer = 0;
        }
        this.isRaging = false;

        // Void tower path extension
        this.pathExtension = 0;
    }

    Enemy.prototype.update = function(dt, game) {
        if (this.isDead || this.reachedEnd) return;

        // Spawn animation
        if (this.spawnTimer > 0) {
            this.spawnTimer -= dt;
        }

        // Hit flash
        if (this.hitFlash > 0) this.hitFlash -= dt;

        // Update effects
        this.updateEffects(dt, game);

        // Calculate effective speed
        var effectiveSpeed = this.getEffectiveSpeed(game);

        // Check stun
        if (this.hasEffect('stun') || this.hasEffect('freeze')) {
            effectiveSpeed = 0;
        }

        // Move along path
        var pixelsPerSecond = effectiveSpeed * game.mapData.cellSize;
        this.distanceTraveled += pixelsPerSecond * dt;

        // Get position from path
        var pixelPath = game.pixelPaths[this.pathIndex];
        var totalPathLen = S.PathSystem.getPathLength(game.pixelPaths, this.pathIndex);
        var effectiveLen = totalPathLen + this.pathExtension * game.mapData.cellSize;

        var pos = S.PathSystem.getPositionAtDistance(pixelPath, this.distanceTraveled);
        this.x = pos.x;
        this.y = pos.y;
        this.angle = pos.angle;

        if (pos.finished || this.distanceTraveled >= effectiveLen) {
            this.reachedEnd = true;
            return;
        }

        // Special abilities
        this.updateSpecial(dt, game);
    };

    Enemy.prototype.getEffectiveSpeed = function(game) {
        var speed = this.baseSpeed;

        // Berserker rage
        if (this.special === 'berserk' && this.hp / this.maxHp <= this.berserkThreshold) {
            speed *= this.berserkSpeedMult;
            this.isBerserk = true;
        }

        // Final Boss rage
        if (this.special === 'finalBoss' && this.hp / this.maxHp <= this.rageThreshold) {
            speed *= this.rageSpeedMult;
            this.isRaging = true;
        }

        // Boss aura (nearby Minor Boss)
        if (!this.isBoss) {
            var enemies = game.enemies;
            for (var i = 0; i < enemies.length; i++) {
                var e = enemies[i];
                if (e === this || e.isDead || !e.auraRange) continue;
                var dist = S.Utils.dist(this.x, this.y, e.x, e.y) / game.mapData.cellSize;
                if (dist <= e.auraRange) {
                    speed *= (1 + e.auraSpeedBuff);
                    break;
                }
            }
        }

        // Slow effect
        var slowEffect = this.getStrongestEffect('slow');
        if (slowEffect) {
            var slowFactor = slowEffect.factor * (1 - this.slowResistance);
            speed *= (1 - slowFactor);
        }

        return speed;
    };

    Enemy.prototype.updateSpecial = function(dt, game) {
        // Healer: heal nearby allies
        if (this.special === 'heal') {
            var healAmount = this.healPerSec * dt;
            var enemies = game.enemies;
            for (var i = 0; i < enemies.length; i++) {
                var e = enemies[i];
                if (e === this || e.isDead || e.reachedEnd) continue;
                var dist = S.Utils.dist(this.x, this.y, e.x, e.y) / game.mapData.cellSize;
                if (dist <= this.healRange) {
                    e.hp = Math.min(e.maxHp, e.hp + healAmount);
                    // Visual: occasionally spawn heal particles
                    if (Math.random() < dt * 3) {
                        game.particles.healEffect(e.x, e.y);
                    }
                }
            }
        }

        // Shield Bearer: grant shields
        if (this.special === 'shield') {
            this.shieldTimer -= dt;
            if (this.shieldTimer <= 0) {
                this.shieldTimer = this.shieldCooldown;
                var enemies2 = game.enemies;
                for (var j = 0; j < enemies2.length; j++) {
                    var e2 = enemies2[j];
                    if (e2 === this || e2.isDead || e2.reachedEnd) continue;
                    var dist2 = S.Utils.dist(this.x, this.y, e2.x, e2.y) / game.mapData.cellSize;
                    if (dist2 <= this.shieldRange && e2.shield <= 0) {
                        e2.shield = this.shieldAmount;
                        game.particles.shieldEffect(e2.x, e2.y);
                    }
                }
            }
        }

        // Final Boss self-heal
        if (this.special === 'finalBoss' && this.bossHealInterval) {
            this.bossHealTimer += dt;
            if (this.bossHealTimer >= this.bossHealInterval) {
                this.bossHealTimer = 0;
                this.hp = Math.min(this.maxHp, this.hp + this.bossHealAmount);
                game.particles.healEffect(this.x, this.y);
            }
        }
    };

    Enemy.prototype.updateEffects = function(dt, game) {
        for (var i = this.effects.length - 1; i >= 0; i--) {
            var eff = this.effects[i];
            eff.remaining -= dt;

            // DoT damage
            if (eff.type === 'dot') {
                eff.tickTimer = (eff.tickTimer || 0) + dt;
                if (eff.tickTimer >= 0.5) {
                    eff.tickTimer = 0;
                    this.takeDamage(eff.dps * 0.5, game, true);
                }
            }

            if (eff.remaining <= 0) {
                this.effects.splice(i, 1);
            }
        }
    };

    Enemy.prototype.takeDamage = function(amount, game, ignoreArmor) {
        if (this.isDead) return;

        // Apply armor
        if (!ignoreArmor && this.physResist > 0) {
            amount *= (1 - this.physResist);
        }

        // Shield absorb
        if (this.shield > 0) {
            if (this.shield >= amount) {
                this.shield -= amount;
                return;
            } else {
                amount -= this.shield;
                this.shield = 0;
            }
        }

        this.hp -= amount;
        this.hitFlash = 0.1;

        if (this.hp <= 0) {
            this.hp = 0;
            this.die(game);
        }
    };

    Enemy.prototype.die = function(game) {
        this.isDead = true;

        // Grant gold
        game.addGold(this.reward, this.x, this.y);
        game.killCount++;

        // Death particles
        game.particles.explosion(this.x, this.y, this.color);

        // Play death sound
        if (S.audio) S.audio.playEnemyDeath(this.type);

        // Splitter: spawn mini enemies
        if (this.special === 'split' && this.splitType) {
            for (var i = 0; i < this.splitCount; i++) {
                var mini = new Enemy(this.splitType, this.pathIndex, game);
                mini.distanceTraveled = this.distanceTraveled + (i - 0.5) * game.mapData.cellSize * 0.3;
                var pos = S.PathSystem.getPositionAtDistance(game.pixelPaths[this.pathIndex], mini.distanceTraveled);
                mini.x = pos.x + (Math.random() - 0.5) * 10;
                mini.y = pos.y + (Math.random() - 0.5) * 10;
                game.enemies.push(mini);
            }
        }

        // Summoner-like enemies could go here
    };

    Enemy.prototype.applyEffect = function(effect) {
        // Don't stack same type — keep strongest
        if (effect.type === 'slow') {
            var existing = this.getStrongestEffect('slow');
            if (existing && existing.factor >= effect.factor) {
                existing.remaining = Math.max(existing.remaining, effect.duration);
                return;
            }
            // Remove weaker slow
            this.removeEffects('slow');
        }

        this.effects.push({
            type: effect.type,
            factor: effect.factor || 0,
            duration: effect.duration,
            remaining: effect.duration,
            dps: effect.dps || 0,
            tickTimer: 0
        });
    };

    Enemy.prototype.hasEffect = function(type) {
        for (var i = 0; i < this.effects.length; i++) {
            if (this.effects[i].type === type) return true;
        }
        return false;
    };

    Enemy.prototype.getStrongestEffect = function(type) {
        var best = null;
        for (var i = 0; i < this.effects.length; i++) {
            if (this.effects[i].type === type) {
                if (!best || this.effects[i].factor > best.factor) {
                    best = this.effects[i];
                }
            }
        }
        return best;
    };

    Enemy.prototype.removeEffects = function(type) {
        for (var i = this.effects.length - 1; i >= 0; i--) {
            if (this.effects[i].type === type) this.effects.splice(i, 1);
        }
    };

    Enemy.prototype.render = function(ctx, game) {
        if (this.isDead) return;

        var cellSize = game.mapData.cellSize;
        var s = cellSize * this.size * 0.4;
        var alpha = this.spawnTimer > 0 ? 1 - this.spawnTimer / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Berserk/Rage glow
        if (this.isBerserk || this.isRaging) {
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 15;
        }

        // Boss glow
        if (this.isBoss && !this.isRaging) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 12;
        }

        // Hit flash
        var drawColor = this.hitFlash > 0 ? '#ffffff' : this.color;

        // Shield visual
        if (this.shield > 0) {
            ctx.strokeStyle = '#5588cc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, s + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw shape
        ctx.fillStyle = drawColor;
        switch (this.shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = S.Utils.lightenColor(drawColor);
                ctx.lineWidth = 1.5;
                ctx.stroke();
                break;
            case 'square':
                ctx.fillRect(this.x - s, this.y - s, s * 2, s * 2);
                ctx.strokeStyle = S.Utils.lightenColor(drawColor);
                ctx.lineWidth = this.type === 'tank' ? 2.5 : 1.5;
                ctx.strokeRect(this.x - s, this.y - s, s * 2, s * 2);
                break;
            case 'triangle':
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(this.angle) * s, this.y + Math.sin(this.angle) * s);
                ctx.lineTo(this.x + Math.cos(this.angle + 2.4) * s, this.y + Math.sin(this.angle + 2.4) * s);
                ctx.lineTo(this.x + Math.cos(this.angle - 2.4) * s, this.y + Math.sin(this.angle - 2.4) * s);
                ctx.closePath();
                ctx.fill();
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - s);
                ctx.lineTo(this.x + s, this.y);
                ctx.lineTo(this.x, this.y + s);
                ctx.lineTo(this.x - s, this.y);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = S.Utils.lightenColor(drawColor);
                ctx.lineWidth = 1.5;
                ctx.stroke();
                break;
            case 'cross':
                var w = s * 0.35;
                ctx.fillRect(this.x - s, this.y - w, s * 2, w * 2);
                ctx.fillRect(this.x - w, this.y - s, w * 2, s * 2);
                break;
            case 'hexagon':
                ctx.beginPath();
                for (var i = 0; i < 6; i++) {
                    var a = Math.PI / 3 * i - Math.PI / 6;
                    var px = this.x + Math.cos(a) * s;
                    var py = this.y + Math.sin(a) * s;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = S.Utils.lightenColor(drawColor);
                ctx.lineWidth = 1.5;
                ctx.stroke();
                break;
            case 'shield':
                // Shield shape
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - s);
                ctx.lineTo(this.x + s, this.y - s * 0.3);
                ctx.lineTo(this.x + s * 0.7, this.y + s);
                ctx.lineTo(this.x, this.y + s * 0.7);
                ctx.lineTo(this.x - s * 0.7, this.y + s);
                ctx.lineTo(this.x - s, this.y - s * 0.3);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = S.Utils.lightenColor(drawColor);
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
            case 'octagon':
                ctx.beginPath();
                for (var j = 0; j < 8; j++) {
                    var a2 = Math.PI / 4 * j - Math.PI / 8;
                    var px2 = this.x + Math.cos(a2) * s;
                    var py2 = this.y + Math.sin(a2) * s;
                    if (j === 0) ctx.moveTo(px2, py2);
                    else ctx.lineTo(px2, py2);
                }
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = S.Utils.lightenColor(drawColor);
                ctx.lineWidth = 3;
                ctx.stroke();
                break;
        }

        ctx.shadowBlur = 0;

        // HP Bar (skip for tiny enemies)
        if (this.hp < this.maxHp && this.size > 0.35) {
            var barW = cellSize * this.size * 0.8;
            var barH = 4;
            var barX = this.x - barW / 2;
            var barY = this.y - s - 8;
            var hpPct = this.hp / this.maxHp;

            ctx.fillStyle = '#333333';
            ctx.fillRect(barX, barY, barW, barH);

            ctx.fillStyle = hpPct > 0.6 ? S.COLORS.ELECTRIC_GREEN :
                           hpPct > 0.3 ? S.COLORS.WARNING_ORANGE : S.COLORS.DANGER_RED;
            ctx.fillRect(barX, barY, barW * hpPct, barH);

            // Shield bar
            if (this.shield > 0) {
                var shieldPct = Math.min(1, this.shield / 30);
                ctx.fillStyle = '#5588cc';
                ctx.fillRect(barX, barY - 3, barW * shieldPct, 2);
            }
        }

        // Boss name + big HP bar
        if (this.isBoss) {
            var bBarW = 60;
            var bBarH = 6;
            var bBarX = this.x - bBarW / 2;
            var bBarY = this.y - s - 16;
            var bHpPct = this.hp / this.maxHp;

            ctx.fillStyle = '#222222';
            ctx.fillRect(bBarX - 1, bBarY - 1, bBarW + 2, bBarH + 2);
            ctx.fillStyle = bHpPct > 0.5 ? '#ff8800' : '#ff2222';
            ctx.fillRect(bBarX, bBarY, bBarW * bHpPct, bBarH);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this.name, this.x, bBarY - 2);
        }

        ctx.restore();
    };

    S.Enemy = Enemy;
})();
