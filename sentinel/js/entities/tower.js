(function() {
    'use strict';
    var S = window.Sentinel;

    function Tower(type, gridCol, gridRow, game) {
        var data = S.data.towers[type];
        this.type = type;
        this.data = data;
        this.gridCol = gridCol;
        this.gridRow = gridRow;
        this.tier = 0; // 0-indexed (T1=0, T2=1, T3=2, T4=3)
        this.totalInvested = data.tiers[0].cost;

        // Pixel position
        var pos = S.Utils.cellToPixel(gridCol, gridRow, game.mapData);
        this.x = pos.x;
        this.y = pos.y;

        // Attack state
        this.attackTimer = 0;
        this.target = null;
        this.angle = 0;

        // Synergy
        this.synergyBuffs = {};
        this.activeSynergies = [];

        // Amplifier buff tracking
        this.amplifierBuffs = { atk: 0, spd: 0 };

        // Hero buff tracking
        this.heroBuffs = { atk: 0, spd: 0 };

        // Overcharge state (Amplifier T4)
        this.overchargeTimer = 0;
        this.overchargeCooldown = 0;
        this.isOvercharged = false;

        // Freeze state (Slow T4)
        this.freezeTimer = 0;

        // Blackhole state (Void T4)
        this.blackholeCooldown = 0;

        // Visual
        this.placeTimer = 0.2;
        this.upgradeFlash = 0;

        // Flame tower rotation
        this.flameAngle = 0;
    }

    Tower.prototype.getTierData = function() {
        return this.data.tiers[this.tier];
    };

    Tower.prototype.getEffectiveDamage = function() {
        var base = this.getTierData().damage;
        var mult = 1 + (this.amplifierBuffs.atk || 0) + (this.heroBuffs.atk || 0);
        return Math.round(base * mult);
    };

    Tower.prototype.getEffectiveAttackSpeed = function() {
        var base = this.getTierData().attackSpeed;
        var mult = 1 + (this.amplifierBuffs.spd || 0) + (this.heroBuffs.spd || 0) +
                   (this.synergyBuffs.spdBuff || 0);
        if (this.isOvercharged) mult *= 2;
        return base * mult;
    };

    Tower.prototype.getEffectiveRange = function() {
        return this.getTierData().range;
    };

    Tower.prototype.getEffectiveSplash = function() {
        var base = this.getTierData().splash || 0;
        return base * (1 + (this.synergyBuffs.splashBuff || 0));
    };

    Tower.prototype.getSlowFactor = function() {
        var base = this.getTierData().slowFactor || 0;
        return base + (this.synergyBuffs.slowBuff || 0);
    };

    Tower.prototype.getSlowDuration = function() {
        return this.getTierData().slowDuration || 2;
    };

    Tower.prototype.getPierce = function() {
        var td = this.getTierData();
        return td.pierce || 0;
    };

    Tower.prototype.getPathExtend = function() {
        return this.getTierData().pathExtend || 0;
    };

    Tower.prototype.getExtendDuration = function() {
        return this.getTierData().extendDuration || 3;
    };

    Tower.prototype.canUpgrade = function() {
        return this.tier < this.data.tiers.length - 1;
    };

    Tower.prototype.getUpgradeCost = function() {
        if (!this.canUpgrade()) return null;
        return this.data.tiers[this.tier + 1].cost;
    };

    Tower.prototype.upgrade = function() {
        if (!this.canUpgrade()) return false;
        this.tier++;
        this.totalInvested += this.data.tiers[this.tier].cost;
        this.upgradeFlash = 0.5;
        return true;
    };

    Tower.prototype.getSellPrice = function() {
        return Math.floor(this.totalInvested * 0.75);
    };

    Tower.prototype.update = function(dt, game) {
        // Place animation
        if (this.placeTimer > 0) this.placeTimer -= dt;
        if (this.upgradeFlash > 0) this.upgradeFlash -= dt;

        // Amplifier: no attack, just buffs
        if (this.type === 'amplifier') {
            this.updateAmplifier(dt, game);
            return;
        }

        // Flame tower: continuous area damage
        if (this.type === 'flame') {
            this.updateFlame(dt, game);
            return;
        }

        // Attack timer
        var atkSpeed = this.getEffectiveAttackSpeed();
        if (atkSpeed <= 0) return;

        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
            // Find target
            this.target = this.findTarget(game);
            if (this.target) {
                this.attack(game);
                this.attackTimer = 1.0 / atkSpeed;
            } else {
                this.attackTimer = 0.1; // retry quickly
            }
        }

        // Update angle to target
        if (this.target && !this.target.isDead) {
            this.angle = S.Utils.angleToTarget(this.x, this.y, this.target.x, this.target.y);
        }

        // Slow T4: periodic freeze
        if (this.type === 'slow' && this.tier === 3) {
            var td = this.getTierData();
            if (td.special === 'freeze') {
                this.freezeTimer -= dt;
                if (this.freezeTimer <= 0) {
                    this.freezeTimer = td.freezeInterval;
                    this.freezeNearbyEnemy(game);
                }
            }
        }

        // Void T4: blackhole
        if (this.type === 'void' && this.tier === 3) {
            if (this.blackholeCooldown > 0) this.blackholeCooldown -= dt;
            var vtd = this.getTierData();
            if (vtd.special === 'blackhole' && this.blackholeCooldown <= 0) {
                this.activateBlackhole(game);
                this.blackholeCooldown = vtd.bhCooldown;
            }
        }

        // Tesla T4 overload stun is handled in attack
    };

    Tower.prototype.findTarget = function(game) {
        var range = this.getEffectiveRange() * game.mapData.cellSize;
        var enemies = game.enemies;
        var targeting = this.data.targeting;
        var best = null;
        var bestVal = targeting === 'strongest' ? 0 : Infinity;

        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd) continue;
            if (e.hasEffect('stealth')) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d > range) continue;

            if (targeting === 'closest' || targeting === 'area') {
                if (d < bestVal) { bestVal = d; best = e; }
            } else if (targeting === 'strongest') {
                if (e.hp > bestVal) { bestVal = e.hp; best = e; }
            } else if (targeting === 'fastest') {
                if (e.speed > bestVal) { bestVal = e.speed; best = e; }
            }
        }
        return best;
    };

    Tower.prototype.attack = function(game) {
        if (!this.target) return;

        // Tesla: chain lightning (no projectile)
        if (this.type === 'tesla') {
            this.chainLightning(game);
            if (S.audio) S.audio.playTowerAttack('tesla');
            return;
        }

        // Sniper T4 multishot
        if (this.type === 'arrow' && this.tier === 3) {
            var td = this.getTierData();
            if (td.special === 'multishot') {
                var targets = this.findMultipleTargets(game, td.targets);
                for (var t = 0; t < targets.length; t++) {
                    game.projectiles.push(new S.Projectile(this, targets[t], game));
                }
                if (S.audio) S.audio.playTowerAttack('arrow');
                return;
            }
        }

        // Standard projectile
        game.projectiles.push(new S.Projectile(this, this.target, game));
        if (S.audio) S.audio.playTowerAttack(this.type);
    };

    Tower.prototype.findMultipleTargets = function(game, count) {
        var range = this.getEffectiveRange() * game.mapData.cellSize;
        var enemies = game.enemies;
        var targets = [];
        var sorted = [];

        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d <= range) sorted.push({ enemy: e, dist: d });
        }

        sorted.sort(function(a, b) { return a.dist - b.dist; });
        for (var j = 0; j < Math.min(count, sorted.length); j++) {
            targets.push(sorted[j].enemy);
        }
        return targets;
    };

    Tower.prototype.chainLightning = function(game) {
        var td = this.getTierData();
        var chainCount = td.chainCount;
        var chainDecay = td.chainDecay;
        var damage = this.getEffectiveDamage();
        var range = this.getEffectiveRange() * game.mapData.cellSize;

        // Find chain targets
        var chainTargets = [this.target];
        var hitSet = [this.target];
        var current = this.target;

        for (var c = 1; c < chainCount; c++) {
            var best = null;
            var bestDist = range;
            for (var i = 0; i < game.enemies.length; i++) {
                var e = game.enemies[i];
                if (e.isDead || e.reachedEnd || hitSet.indexOf(e) >= 0) continue;
                var d = S.Utils.dist(current.x, current.y, e.x, e.y);
                if (d < bestDist) { bestDist = d; best = e; }
            }
            if (!best) break;
            chainTargets.push(best);
            hitSet.push(best);
            current = best;
        }

        // Apply damage with decay
        for (var j = 0; j < chainTargets.length; j++) {
            var dmg = damage * Math.pow(1 - chainDecay, j);
            chainTargets[j].takeDamage(dmg, game);
            game.particles.lightningEffect(chainTargets[j].x, chainTargets[j].y);

            // Overload stun (T4)
            if (td.special === 'overload' && j >= td.stunMinChain - 1) {
                chainTargets[j].applyEffect({
                    type: 'stun',
                    duration: td.stunDuration
                });
            }
        }

        // Store chain targets for visual rendering
        this.lastChainTargets = chainTargets;
        this.chainVisualTimer = 0.2;
    };

    Tower.prototype.updateAmplifier = function(dt, game) {
        var td = this.getTierData();
        var range = td.range * game.mapData.cellSize;

        // Apply buffs to nearby towers
        for (var i = 0; i < game.towers.length; i++) {
            var t = game.towers[i];
            if (t === this || t.type === 'amplifier') continue;
            var d = S.Utils.dist(this.x, this.y, t.x, t.y);
            if (d <= range) {
                t.amplifierBuffs.atk = Math.max(t.amplifierBuffs.atk, td.atkBuff);
                t.amplifierBuffs.spd = Math.max(t.amplifierBuffs.spd, td.spdBuff || 0);
            }
        }

        // Overcharge (T4)
        if (td.special === 'overcharge') {
            this.overchargeCooldown -= dt;
            if (this.overchargeCooldown <= 0) {
                this.overchargeCooldown = td.overchargeInterval;
                // Find best tower in range to overcharge
                var bestTower = null;
                var bestDps = 0;
                for (var j = 0; j < game.towers.length; j++) {
                    var t2 = game.towers[j];
                    if (t2 === this || t2.type === 'amplifier') continue;
                    var d2 = S.Utils.dist(this.x, this.y, t2.x, t2.y);
                    if (d2 <= range) {
                        var dps = t2.getEffectiveDamage() * t2.getEffectiveAttackSpeed();
                        if (dps > bestDps) { bestDps = dps; bestTower = t2; }
                    }
                }
                if (bestTower) {
                    bestTower.isOvercharged = true;
                    bestTower.overchargeTimer = td.overchargeDuration;
                }
            }
        }
    };

    Tower.prototype.updateFlame = function(dt, game) {
        var td = this.getTierData();
        var range = td.range * game.mapData.cellSize;
        var halfAngle = (td.coneAngle / 2) * Math.PI / 180;
        var damage = td.damage * dt; // DPS * dt

        // Find closest enemy for flame direction
        var target = this.findTarget(game);
        if (target) {
            this.flameAngle = S.Utils.angleToTarget(this.x, this.y, target.x, target.y);
        }

        // Hit enemies in cone
        var enemies = game.enemies;
        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d > range) continue;

            var angle = Math.atan2(e.y - this.y, e.x - this.x);
            var diff = angle - this.flameAngle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (Math.abs(diff) <= halfAngle) {
                e.takeDamage(damage, game);

                // DoT
                if (td.dotDps > 0) {
                    e.applyEffect({
                        type: 'dot',
                        dps: td.dotDps,
                        duration: td.dotDuration
                    });

                    // Dragon flame: spread DoT
                    if (td.dotSpread) {
                        for (var j = 0; j < enemies.length; j++) {
                            var e2 = enemies[j];
                            if (e2 === e || e2.isDead || e2.reachedEnd) continue;
                            if (S.Utils.dist(e.x, e.y, e2.x, e2.y) < game.mapData.cellSize) {
                                e2.applyEffect({
                                    type: 'dot',
                                    dps: td.dotDps * 0.5,
                                    duration: td.dotDuration * 0.5
                                });
                            }
                        }
                    }
                }

                // Particle
                if (Math.random() < dt * 8) {
                    game.particles.fireEffect(e.x, e.y);
                }
            }
        }

        // Fire visual particles
        if (target && Math.random() < dt * 15) {
            var px = this.x + Math.cos(this.flameAngle) * range * 0.5;
            var py = this.y + Math.sin(this.flameAngle) * range * 0.5;
            game.particles.fireEffect(px, py);
        }
    };

    Tower.prototype.freezeNearbyEnemy = function(game) {
        var td = this.getTierData();
        var range = td.range * game.mapData.cellSize;
        var enemies = game.enemies;
        var target = null;
        var closestDist = Infinity;

        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd || e.isBoss || e.hasEffect('freeze')) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d < closestDist && d <= range) {
                closestDist = d;
                target = e;
            }
        }
        if (target) {
            target.applyEffect({ type: 'freeze', duration: td.freezeDuration });
            game.particles.iceEffect(target.x, target.y);
        }
    };

    Tower.prototype.activateBlackhole = function(game) {
        var td = this.getTierData();
        var range = td.range * game.mapData.cellSize;
        var enemies = game.enemies;

        for (var i = 0; i < enemies.length; i++) {
            var e = enemies[i];
            if (e.isDead || e.reachedEnd) continue;
            var d = S.Utils.dist(this.x, this.y, e.x, e.y);
            if (d <= range) {
                e.applyEffect({ type: 'stun', duration: td.bhDuration });
                // Pull towards tower
                var angle = Math.atan2(this.y - e.y, this.x - e.x);
                e.distanceTraveled = Math.max(0, e.distanceTraveled - game.mapData.cellSize * 0.5);
            }
        }
        game.particles.voidEffect(this.x, this.y);
        this.blackholeVisualTimer = 0.5;
    };

    Tower.prototype.render = function(ctx, game) {
        var cellSize = game.mapData.cellSize;
        var s = cellSize * 0.35;
        var alpha = this.placeTimer > 0 ? 1 - this.placeTimer / 0.2 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Synergy glow
        if (this.activeSynergies && this.activeSynergies.length > 0) {
            ctx.shadowColor = this.data.color;
            ctx.shadowBlur = 8;
        }

        // Overcharge glow
        if (this.isOvercharged) {
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 15;
        }

        // Upgrade flash
        if (this.upgradeFlash > 0) {
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 20;
        }

        var color = this.data.color;
        var tierColors = [color, S.Utils.lightenColor(color, 20), S.Utils.lightenColor(color, 40), S.Utils.lightenColor(color, 60)];
        var drawColor = tierColors[Math.min(this.tier, 3)];

        ctx.fillStyle = drawColor;

        switch (this.data.shape) {
            case 'triangle': // Arrow
                ctx.beginPath();
                ctx.moveTo(this.x + Math.cos(this.angle) * s, this.y + Math.sin(this.angle) * s);
                ctx.lineTo(this.x + Math.cos(this.angle + 2.3) * s, this.y + Math.sin(this.angle + 2.3) * s);
                ctx.lineTo(this.x + Math.cos(this.angle - 2.3) * s, this.y + Math.sin(this.angle - 2.3) * s);
                ctx.closePath();
                ctx.fill();
                if (this.tier >= 1) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
                break;

            case 'square': // Cannon
                ctx.fillRect(this.x - s, this.y - s, s * 2, s * 2);
                // Barrel
                ctx.fillStyle = S.Utils.darkenColor(drawColor, 20);
                var bLen = s * 0.8;
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle);
                ctx.fillRect(0, -s * 0.2, bLen, s * 0.4);
                ctx.restore();
                break;

            case 'hexagon': // Slow
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
                if (this.tier >= 1) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    var inner = s * 0.6;
                    ctx.beginPath();
                    for (var i2 = 0; i2 < 6; i2++) {
                        var a2 = Math.PI / 3 * i2 - Math.PI / 6;
                        var px2 = this.x + Math.cos(a2) * inner;
                        var py2 = this.y + Math.sin(a2) * inner;
                        if (i2 === 0) ctx.moveTo(px2, py2);
                        else ctx.lineTo(px2, py2);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
                break;

            case 'diamond': // Sniper
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - s);
                ctx.lineTo(this.x + s, this.y);
                ctx.lineTo(this.x, this.y + s);
                ctx.lineTo(this.x - s, this.y);
                ctx.closePath();
                ctx.fill();
                // Crosshair
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                var cs = s * 0.5;
                ctx.beginPath();
                ctx.moveTo(this.x - cs, this.y);
                ctx.lineTo(this.x + cs, this.y);
                ctx.moveTo(this.x, this.y - cs);
                ctx.lineTo(this.x, this.y + cs);
                ctx.stroke();
                break;

            case 'star': // Amplifier
                ctx.beginPath();
                for (var k = 0; k < 5; k++) {
                    var outerA = Math.PI / 2.5 * k - Math.PI / 2;
                    var innerA = outerA + Math.PI / 5;
                    ctx.lineTo(this.x + Math.cos(outerA) * s, this.y + Math.sin(outerA) * s);
                    ctx.lineTo(this.x + Math.cos(innerA) * s * 0.5, this.y + Math.sin(innerA) * s * 0.5);
                }
                ctx.closePath();
                ctx.fill();
                // Pulse ring
                var pulse = (Math.sin(Date.now() / 300) + 1) * 0.3 + 0.4;
                ctx.strokeStyle = S.Utils.colorAlpha(drawColor, pulse);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.getTierData().range * cellSize, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'bolt': // Tesla
                // Lightning bolt shape
                ctx.beginPath();
                ctx.moveTo(this.x - s * 0.3, this.y - s);
                ctx.lineTo(this.x + s * 0.2, this.y - s * 0.2);
                ctx.lineTo(this.x - s * 0.1, this.y);
                ctx.lineTo(this.x + s * 0.4, this.y + s);
                ctx.lineTo(this.x - s * 0.1, this.y + s * 0.2);
                ctx.lineTo(this.x + s * 0.1, this.y);
                ctx.closePath();
                ctx.fill();
                // Chain lightning visual
                if (this.chainVisualTimer > 0) {
                    this.chainVisualTimer -= 0.016;
                    if (this.lastChainTargets) {
                        ctx.strokeStyle = S.Utils.colorAlpha('#aa55ff', this.chainVisualTimer / 0.2);
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(this.x, this.y);
                        for (var ci = 0; ci < this.lastChainTargets.length; ci++) {
                            ctx.lineTo(this.lastChainTargets[ci].x, this.lastChainTargets[ci].y);
                        }
                        ctx.stroke();
                    }
                }
                break;

            case 'flame': // Flame
                // Fire shape
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - s);
                ctx.quadraticCurveTo(this.x + s, this.y - s * 0.5, this.x + s * 0.5, this.y + s * 0.5);
                ctx.quadraticCurveTo(this.x, this.y + s, this.x, this.y + s);
                ctx.quadraticCurveTo(this.x, this.y + s, this.x - s * 0.5, this.y + s * 0.5);
                ctx.quadraticCurveTo(this.x - s, this.y - s * 0.5, this.x, this.y - s);
                ctx.closePath();
                ctx.fill();
                // Cone indicator
                var coneAngle = (this.getTierData().coneAngle / 2) * Math.PI / 180;
                var flameRange = this.getTierData().range * cellSize;
                ctx.strokeStyle = S.Utils.colorAlpha('#ff4400', 0.2);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.arc(this.x, this.y, flameRange, this.flameAngle - coneAngle, this.flameAngle + coneAngle);
                ctx.closePath();
                ctx.stroke();
                break;

            case 'portal': // Void
                // Portal circle with inner void
                ctx.beginPath();
                ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000011';
                ctx.beginPath();
                ctx.arc(this.x, this.y, s * 0.5, 0, Math.PI * 2);
                ctx.fill();
                // Rotating ring
                ctx.strokeStyle = S.Utils.colorAlpha('#aa55ff', 0.5);
                ctx.lineWidth = 2;
                var rotAngle = Date.now() / 500;
                ctx.beginPath();
                ctx.arc(this.x, this.y, s * 0.75, rotAngle, rotAngle + Math.PI);
                ctx.stroke();
                // Blackhole visual
                if (this.blackholeVisualTimer > 0) {
                    this.blackholeVisualTimer -= 0.016;
                    ctx.strokeStyle = S.Utils.colorAlpha('#8800ff', this.blackholeVisualTimer / 0.5);
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.getTierData().range * cellSize * (1 - this.blackholeVisualTimer / 0.5), 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
        }

        // Tier indicator dots
        ctx.shadowBlur = 0;
        if (this.tier > 0) {
            ctx.fillStyle = '#ffffff';
            for (var ti = 0; ti <= this.tier; ti++) {
                var dotX = this.x - (this.tier * 3) + ti * 6;
                var dotY = this.y + s + 4;
                ctx.beginPath();
                ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    };

    // Reset per-frame buff accumulations
    Tower.prototype.resetFrameBuffs = function() {
        this.amplifierBuffs = { atk: 0, spd: 0 };
        this.heroBuffs = { atk: 0, spd: 0 };

        // Overcharge decay
        if (this.isOvercharged) {
            this.overchargeTimer -= 0.016;
            if (this.overchargeTimer <= 0) this.isOvercharged = false;
        }
    };

    S.Tower = Tower;
})();
