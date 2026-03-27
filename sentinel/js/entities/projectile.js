(function() {
    'use strict';
    var S = window.Sentinel;

    function Projectile(tower, target, game) {
        this.tower = tower;
        this.target = target;
        this.type = tower.type;
        this.x = tower.x;
        this.y = tower.y;
        this.speed = 350; // px/s
        this.damage = tower.getEffectiveDamage();
        this.reached = false;
        this.pierceCount = tower.getPierce();
        this.hitTargets = [];

        // Cannon specifics
        if (this.type === 'cannon') {
            this.splash = tower.getEffectiveSplash();
            this.speed = 250;
            this.targetX = target.x;
            this.targetY = target.y;
        }

        // Slow specifics
        if (this.type === 'slow') {
            this.slowFactor = tower.getSlowFactor();
            this.slowDuration = tower.getSlowDuration();
        }

        // Sniper is instant (laser)
        if (this.type === 'sniper') {
            this.speed = 9999;
            this.laserTimer = 0.15;
            this.laserStartX = tower.x;
            this.laserStartY = tower.y;
        }

        // Void
        if (this.type === 'void') {
            this.speed = 200;
            this.pathExtend = tower.getPathExtend();
            this.extendDuration = tower.getExtendDuration();
        }
    }

    Projectile.prototype.update = function(dt, game) {
        if (this.reached) return;

        // Sniper laser: instant hit
        if (this.type === 'sniper') {
            if (this.laserTimer > 0) {
                this.laserTimer -= dt;
                if (this.target && !this.target.isDead) {
                    this.x = this.target.x;
                    this.y = this.target.y;
                }
                return;
            }
            this.reached = true;
            return;
        }

        if (!this.target || this.target.isDead) {
            // For cannon, continue to target position
            if (this.type === 'cannon') {
                var dx2 = this.targetX - this.x;
                var dy2 = this.targetY - this.y;
                var dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                if (dist2 < 8) {
                    this.onHit(game);
                    this.reached = true;
                    return;
                }
                this.x += (dx2 / dist2) * this.speed * dt;
                this.y += (dy2 / dist2) * this.speed * dt;
                return;
            }
            this.reached = true;
            return;
        }

        var dx = this.target.x - this.x;
        var dy = this.target.y - this.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 8) {
            this.onHit(game);
            // Arrow pierce: continue to next target
            if (this.pierceCount > 0 && this.type === 'arrow') {
                this.pierceCount--;
                this.hitTargets.push(this.target);
                this.target = this.findNextTarget(game);
                if (!this.target) this.reached = true;
            } else {
                this.reached = true;
            }
            return;
        }

        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
    };

    Projectile.prototype.onHit = function(game) {
        var target = this.target;

        // Cannon splash
        if (this.type === 'cannon' && this.splash > 0) {
            var splashPx = this.splash * game.mapData.cellSize;
            var hitX = target ? target.x : this.targetX;
            var hitY = target ? target.y : this.targetY;
            var enemies = game.enemies;
            for (var i = 0; i < enemies.length; i++) {
                var e = enemies[i];
                if (e.isDead || e.reachedEnd) continue;
                var d = S.Utils.dist(hitX, hitY, e.x, e.y);
                if (d <= splashPx) {
                    e.takeDamage(this.damage, game);
                }
            }
            game.particles.explosion(hitX, hitY, S.COLORS.TOWER_CANNON);

            // Cluster bomb (T4)
            if (this.tower.tier === 3 && this.tower.getTierData().special === 'cluster') {
                for (var c = 0; c < 3; c++) {
                    var angle = Math.random() * Math.PI * 2;
                    var clusterDist = splashPx * 0.5 + Math.random() * splashPx * 0.5;
                    var cx = hitX + Math.cos(angle) * clusterDist;
                    var cy = hitY + Math.sin(angle) * clusterDist;
                    // Delayed mini explosion
                    (function(px, py, dmg) {
                        setTimeout(function() {
                            var enemies2 = game.enemies;
                            for (var j = 0; j < enemies2.length; j++) {
                                var e2 = enemies2[j];
                                if (e2.isDead || e2.reachedEnd) continue;
                                if (S.Utils.dist(px, py, e2.x, e2.y) <= splashPx * 0.6) {
                                    e2.takeDamage(dmg * 0.5, game);
                                }
                            }
                            game.particles.explosion(px, py, '#ff8800');
                        }, 100 + c * 80);
                    })(cx, cy, this.damage);
                }
            }

            // Knockback (T3)
            if (this.tower.tier >= 2 && this.tower.getTierData().special === 'knockback') {
                for (var kb = 0; kb < enemies.length; kb++) {
                    var ek = enemies[kb];
                    if (ek.isDead || ek.reachedEnd || ek.isBoss) continue;
                    var dkb = S.Utils.dist(hitX, hitY, ek.x, ek.y);
                    if (dkb <= splashPx) {
                        ek.distanceTraveled = Math.max(0, ek.distanceTraveled - game.mapData.cellSize * 0.3);
                    }
                }
            }

            if (S.audio) S.audio.playTowerAttack('cannon');
            return;
        }

        if (target && !target.isDead) {
            target.takeDamage(this.damage, game);

            // Slow effect
            if (this.type === 'slow') {
                target.applyEffect({
                    type: 'slow',
                    factor: this.slowFactor,
                    duration: this.slowDuration
                });
                game.particles.iceEffect(target.x, target.y);
            }

            // Void path extension
            if (this.type === 'void') {
                target.pathExtension += this.pathExtend;
                target.applyEffect({
                    type: 'slow',
                    factor: 0.2,
                    duration: this.extendDuration
                });
                game.particles.voidEffect(target.x, target.y);
            }

            // Sniper critical hit
            if (this.type === 'sniper' && this.tower.tier === 3) {
                var tierData = this.tower.getTierData();
                if (tierData.special === 'critical') {
                    var critChance = tierData.critChance + (this.tower.synergyBuffs.critBonus || 0);
                    if (Math.random() < critChance) {
                        target.takeDamage(this.damage * (tierData.critMult - 1), game, true);
                        game.particles.explosion(target.x, target.y, '#ff00ff');
                    }
                }
            }
        }
    };

    Projectile.prototype.findNextTarget = function(game) {
        var enemies = game.enemies;
        var closest = null;
        var closestDist = Infinity;
        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd || this.hitTargets.indexOf(e) >= 0) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d < closestDist && d < game.mapData.cellSize * 3) {
                closest = e;
                closestDist = d;
            }
        }
        return closest;
    };

    Projectile.prototype.render = function(ctx, game) {
        if (this.reached) return;

        ctx.save();

        switch (this.type) {
            case 'arrow':
                ctx.fillStyle = '#ccffee';
                ctx.beginPath();
                ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'cannon':
                ctx.fillStyle = '#ffcc99';
                ctx.beginPath();
                ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ff9966';
                ctx.lineWidth = 2;
                ctx.stroke();
                break;

            case 'slow':
                ctx.fillStyle = '#99ddff';
                ctx.beginPath();
                for (var i = 0; i < 6; i++) {
                    var a = Math.PI / 3 * i + Date.now() / 200;
                    var px = this.x + Math.cos(a) * 4;
                    var py = this.y + Math.sin(a) * 4;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                break;

            case 'sniper':
                if (this.laserTimer > 0) {
                    ctx.strokeStyle = S.COLORS.TOWER_SNIPER;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = this.laserTimer / 0.15;
                    ctx.shadowColor = S.COLORS.TOWER_SNIPER;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(this.laserStartX, this.laserStartY);
                    ctx.lineTo(this.x, this.y);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
                break;

            case 'void':
                ctx.fillStyle = '#8800ff';
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#aa44ff';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;

            default:
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
        }

        ctx.restore();
    };

    S.Projectile = Projectile;
})();
