// Sentinel - Enemy Class (style-guide 비주얼 반영)

(function() {
    'use strict';

    class Enemy {
        constructor(type) {
            this.type = type;
            this.data = Sentinel.data.enemies[type];

            // 난이도 배율 적용
            var diff = Sentinel.game ? Sentinel.game.difficulty : null;
            var hpMul = diff ? diff.hpMultiplier : 1;
            var spdMul = diff ? diff.speedMultiplier : 1;
            var rwdMul = diff ? diff.rewardMultiplier : 1;

            this.maxHp = Math.round(this.data.hp * hpMul);
            this.hp = this.maxHp;
            this.speed = this.data.speed * spdMul;
            this.baseSpeed = this.speed;
            this.reward = Math.round(this.data.reward * rwdMul);
            this.color = this.data.color;
            this.size = this.data.size;
            this.active = true;
            this.reached = false;

            // 경로
            this.path = Sentinel.managers.path.path;
            this.pathIndex = 0;
            this.x = this.path[0].x;
            this.y = this.path[0].y;

            // 효과
            this.effects = [];
            this.hitFlash = 0;
            this.animTime = Math.random() * Math.PI * 2;

            // Healer
            if (type === 'healer') this.healTimer = 0;

            // Boss rage
            if (type === 'boss') this.isRaging = false;
        }

        update(dt) {
            if (!this.active) return;
            this.animTime += dt * 5;
            if (this.hitFlash > 0) this.hitFlash -= dt;
            this.updateEffects(dt);
            if (this.type === 'healer') this.updateHealing(dt);
            this.move(dt);
        }

        move(dt) {
            if (this.pathIndex >= this.path.length - 1) {
                this.reached = true;
                this.active = false;
                return;
            }
            var target = this.path[this.pathIndex + 1];
            var dx = target.x - this.x;
            var dy = target.y - this.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            var moveDistance = this.speed * dt;

            if (dist <= moveDistance) {
                this.x = target.x;
                this.y = target.y;
                this.pathIndex++;
            } else {
                var ratio = moveDistance / dist;
                this.x += dx * ratio;
                this.y += dy * ratio;
            }
        }

        updateEffects(dt) {
            this.speed = this.baseSpeed;
            for (var i = this.effects.length - 1; i >= 0; i--) {
                var effect = this.effects[i];
                effect.duration -= dt;
                if (effect.duration <= 0) {
                    this.effects.splice(i, 1);
                } else if (effect.type === 'slow') {
                    this.speed *= effect.multiplier;
                }
            }
        }

        updateHealing(dt) {
            this.healTimer += dt;
            if (this.healTimer >= this.data.healInterval) {
                this.healTimer = 0;
                var self = this;
                var game = Sentinel.game;
                game.enemies.forEach(function(enemy) {
                    if (enemy !== self && enemy.active) {
                        var dist = Sentinel.utils.distance(self.x, self.y, enemy.x, enemy.y);
                        if (dist <= self.data.healRadius) {
                            enemy.heal(self.data.healRate);
                        }
                    }
                });
                game.effects.push({
                    type: 'heal', x: this.x, y: this.y,
                    radius: this.data.healRadius, color: '#66ff66',
                    alpha: 0.3, duration: 0.5, elapsed: 0
                });
            }
        }

        takeDamage(amount) {
            if (this.data.armor) amount *= (1 - this.data.armor);
            this.hp -= amount;
            this.hitFlash = 0.1;

            if (this.hp <= 0) {
                this.hp = 0;
                this.active = false;
            }

            // Boss rage (HP 50%)
            if (this.type === 'boss' && this.data.rage && !this.isRaging && this.hp <= this.maxHp * 0.5) {
                this.isRaging = true;
                var diff = Sentinel.game ? Sentinel.game.difficulty : null;
                var spdMul = diff ? diff.speedMultiplier : 1;
                this.baseSpeed = this.data.speed * spdMul * this.data.rageSpeedMultiplier;
                if (Sentinel.game) {
                    Sentinel.game.effects.push({
                        type: 'rage', x: this.x, y: this.y,
                        color: '#ff0000', text: 'RAGE!',
                        duration: 1.5, elapsed: 0
                    });
                }
            }
        }

        heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

        applyEffect(effect) {
            this.effects = this.effects.filter(function(e) { return e.type !== effect.type; });
            this.effects.push(effect);
        }

        lightenColor(hex) {
            var num = parseInt(hex.slice(1), 16);
            var r = Math.min(255, ((num >> 16) & 0xff) + 34);
            var g = Math.min(255, ((num >> 8) & 0xff) + 34);
            var b = Math.min(255, (num & 0xff) + 34);
            return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
        }

        render(ctx) {
            if (!this.active) return;

            var x = this.x;
            var y = this.y;
            var color = this.hitFlash > 0 ? '#ffffff' : this.color;
            var borderColor = this.hitFlash > 0 ? '#ffffff' : this.lightenColor(this.color);

            ctx.save();

            switch (this.type) {
                case 'scout':
                    // 원 (12px 반지름)
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(x, y, 12, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    break;

                case 'soldier':
                    // 사각형 (16px 반변)
                    ctx.fillStyle = color;
                    ctx.fillRect(x - 16, y - 16, 32, 32);
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x - 16, y - 16, 32, 32);
                    break;

                case 'tank':
                    // 큰 사각형 (20px 반변, lineWidth 3)
                    ctx.fillStyle = color;
                    ctx.fillRect(x - 20, y - 20, 40, 40);
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x - 20, y - 20, 40, 40);
                    break;

                case 'healer':
                    // 십자가 (14px 반변)
                    ctx.fillStyle = color;
                    ctx.fillRect(x - 14, y - 14 * 0.4, 28, 14 * 0.8);
                    ctx.fillRect(x - 14 * 0.4, y - 14, 14 * 0.8, 28);
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x - 14, y - 14 * 0.4, 28, 14 * 0.8);
                    ctx.strokeRect(x - 14 * 0.4, y - 14, 14 * 0.8, 28);
                    break;

                case 'boss':
                    // 팔각형 (28px 반지름 + 글로우)
                    if (this.isRaging) {
                        ctx.shadowColor = '#ff4444';
                        ctx.shadowBlur = 25;
                    }
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    for (var i = 0; i < 8; i++) {
                        var angle = (Math.PI / 4) * i;
                        var px = x + Math.cos(angle) * 28;
                        var py = y + Math.sin(angle) * 28;
                        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.shadowColor = borderColor;
                    ctx.shadowBlur = 20;
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 4;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    break;
            }
            ctx.restore();

            // HP 바 (HP < maxHP 일 때만)
            if (this.hp < this.maxHp) {
                var barW = this.type === 'boss' ? 60 : 40;
                var barH = this.type === 'boss' ? 8 : 6;
                Sentinel.utils.drawHealthBar(ctx, x, y - 30, barW, barH, this.hp, this.maxHp);
            }

            // 슬로우 효과 표시
            for (var j = 0; j < this.effects.length; j++) {
                if (this.effects[j].type === 'slow') {
                    ctx.save();
                    ctx.strokeStyle = '#00ccff';
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#00ccff';
                    ctx.shadowBlur = 10;
                    var es = this.getSize() + 8;
                    ctx.strokeRect(x - es, y - es, es * 2, es * 2);
                    ctx.restore();
                    break;
                }
            }
        }

        getSize() {
            switch (this.type) {
                case 'scout': return 12;
                case 'soldier': return 16;
                case 'tank': return 20;
                case 'healer': return 14;
                case 'boss': return 28;
                default: return 12;
            }
        }
    }

    Sentinel.classes.Enemy = Enemy;
})();
