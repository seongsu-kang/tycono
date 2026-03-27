// Sentinel - Enemy Class (폴리싱 버전 — 유형별 비주얼)

(function() {
    'use strict';

    class Enemy {
        constructor(type) {
            this.type = type;
            this.data = Sentinel.data.enemies[type];
            this.maxHp = this.data.hp;
            this.hp = this.maxHp;
            this.speed = this.data.speed;
            this.baseSpeed = this.data.speed;
            this.reward = this.data.reward;
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

            // 피격 플래시
            this.hitFlash = 0;

            // Healer
            if (type === 'healer') {
                this.healTimer = 0;
            }

            // Boss rage
            if (type === 'boss') {
                this.isRaging = false;
            }

            // 애니메이션
            this.animTime = Math.random() * Math.PI * 2;
        }

        update(dt) {
            if (!this.active) return;

            this.animTime += dt * 5;
            if (this.hitFlash > 0) this.hitFlash -= dt;

            this.updateEffects(dt);

            if (this.type === 'healer') {
                this.updateHealing(dt);
            }

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
                } else {
                    if (effect.type === 'slow') {
                        this.speed *= effect.multiplier;
                    }
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
            if (this.data.armor) {
                amount *= (1 - this.data.armor);
            }

            this.hp -= amount;
            this.hitFlash = 0.1;

            if (this.hp <= 0) {
                this.hp = 0;
                this.active = false;
            }

            // Boss rage (HP 50%)
            if (this.type === 'boss' && this.data.rage && !this.isRaging && this.hp <= this.maxHp * 0.5) {
                this.isRaging = true;
                this.baseSpeed = this.data.speed * this.data.rageSpeedMultiplier;

                if (Sentinel.game) {
                    Sentinel.game.effects.push({
                        type: 'rage', x: this.x, y: this.y,
                        color: '#ff0000', text: 'RAGE!',
                        duration: 1.5, elapsed: 0
                    });
                }
            }
        }

        heal(amount) {
            this.hp = Math.min(this.maxHp, this.hp + amount);
        }

        applyEffect(effect) {
            this.effects = this.effects.filter(function(e) { return e.type !== effect.type; });
            this.effects.push(effect);
        }

        render(ctx) {
            if (!this.active) return;

            var x = this.x;
            var y = this.y;
            var size = this.size + Math.sin(this.animTime) * 1;

            // 피격 플래시
            var color = this.hitFlash > 0 ? '#ffffff' : this.color;

            // 유형별 형태
            ctx.save();
            ctx.fillStyle = color;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;

            switch (this.type) {
                case 'scout':
                    // 삼각형 (빠름)
                    ctx.beginPath();
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x - size * 0.8, y + size * 0.6);
                    ctx.lineTo(x + size * 0.8, y + size * 0.6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;

                case 'soldier':
                    // 사각형 (안정)
                    var half = size * 0.7;
                    ctx.fillRect(x - half, y - half, half * 2, half * 2);
                    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
                    break;

                case 'tank':
                    // 팔각형 (큰, 두꺼운)
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    for (var i = 0; i < 8; i++) {
                        var angle = (Math.PI / 4) * i - Math.PI / 8;
                        var px = x + Math.cos(angle) * size;
                        var py = y + Math.sin(angle) * size;
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;

                case 'healer':
                    // 원 + 십자가
                    ctx.beginPath();
                    ctx.arc(x, y, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();

                    // 십자가 마크
                    ctx.fillStyle = '#ffffff';
                    var cw = size * 0.3;
                    var ch = size * 0.8;
                    ctx.fillRect(x - cw / 2, y - ch / 2, cw, ch);
                    ctx.fillRect(x - ch / 2, y - cw / 2, ch, cw);
                    break;

                case 'boss':
                    // 별 모양
                    var spikes = 5;
                    var outerR = size;
                    var innerR = size * 0.5;

                    // rage 시 글로우
                    if (this.isRaging) {
                        ctx.shadowColor = '#ff0000';
                        ctx.shadowBlur = 20;
                    }

                    ctx.beginPath();
                    for (var i = 0; i < spikes * 2; i++) {
                        var r = i % 2 === 0 ? outerR : innerR;
                        var angle = (Math.PI / spikes) * i - Math.PI / 2;
                        var px = x + Math.cos(angle) * r;
                        var py = y + Math.sin(angle) * r;
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    break;

                default:
                    // 원 (기본)
                    ctx.beginPath();
                    ctx.arc(x, y, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
            }
            ctx.restore();

            // HP 바
            var hpBarWidth = this.size * 2.5;
            var hpBarHeight = 4;
            var hpBarY = y - this.size - 10;
            Sentinel.utils.drawHealthBar(ctx, x, hpBarY, hpBarWidth, hpBarHeight, this.hp, this.maxHp);

            // 슬로우 효과 표시
            if (this.effects.length > 0) {
                for (var i = 0; i < this.effects.length; i++) {
                    if (this.effects[i].type === 'slow') {
                        Sentinel.utils.fillCircle(ctx, x, y + this.size + 6, 3, '#64B5F6', 0.8);
                        break;
                    }
                }
            }
        }
    }

    Sentinel.classes.Enemy = Enemy;
})();
