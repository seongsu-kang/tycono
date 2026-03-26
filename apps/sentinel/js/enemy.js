// Sentinel - Enemy Class

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

            // 경로 따라가기
            this.path = Sentinel.managers.path.path;
            this.pathIndex = 0;
            this.x = this.path[0].x;
            this.y = this.path[0].y;
            this.distToNext = 0;

            // 효과
            this.effects = [];

            // Healer 전용
            if (type === 'healer') {
                this.healTimer = 0;
            }

            // 애니메이션
            this.animTime = Math.random() * Math.PI * 2;
        }

        update(dt) {
            if (!this.active) return;

            this.animTime += dt * 5;

            // 효과 업데이트
            this.updateEffects(dt);

            // Healer 로직
            if (this.type === 'healer') {
                this.updateHealing(dt);
            }

            // 이동
            this.move(dt);
        }

        move(dt) {
            if (this.pathIndex >= this.path.length - 1) {
                // 끝점 도달
                this.reached = true;
                this.active = false;
                return;
            }

            const target = this.path[this.pathIndex + 1];
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const moveDistance = this.speed * dt;

            if (dist <= moveDistance) {
                // 다음 웨이포인트로
                this.x = target.x;
                this.y = target.y;
                this.pathIndex++;
            } else {
                // 이동
                const ratio = moveDistance / dist;
                this.x += dx * ratio;
                this.y += dy * ratio;
            }
        }

        updateEffects(dt) {
            this.speed = this.baseSpeed;

            for (let i = this.effects.length - 1; i >= 0; i--) {
                const effect = this.effects[i];
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

                // 주변 적 회복
                const game = Sentinel.game;
                game.enemies.forEach(enemy => {
                    if (enemy !== this && enemy.active) {
                        const dist = Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y);
                        if (dist <= this.data.healRadius) {
                            enemy.heal(this.data.healRate);
                        }
                    }
                });

                // 힐 이펙트
                game.effects.push({
                    type: 'heal',
                    x: this.x,
                    y: this.y,
                    radius: this.data.healRadius,
                    color: this.color,
                    alpha: 0.3,
                    duration: 0.5,
                    elapsed: 0
                });
            }
        }

        takeDamage(amount) {
            this.hp -= amount;
            if (this.hp <= 0) {
                this.hp = 0;
                this.active = false;
            }
        }

        heal(amount) {
            this.hp = Math.min(this.maxHp, this.hp + amount);
        }

        applyEffect(effect) {
            // 기존 같은 타입 효과 제거
            this.effects = this.effects.filter(e => e.type !== effect.type);
            this.effects.push(effect);
        }

        render(ctx) {
            if (!this.active) return;

            // 적 본체 (원)
            const pulseSize = this.size + Math.sin(this.animTime) * 1;
            Sentinel.utils.fillCircle(ctx, this.x, this.y, pulseSize, this.color);

            // 테두리
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, pulseSize, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // HP 바
            const hpBarWidth = this.size * 2.5;
            const hpBarHeight = 4;
            const hpBarY = this.y - this.size - 8;
            Sentinel.utils.drawHealthBar(ctx, this.x, hpBarY, hpBarWidth, hpBarHeight, this.hp, this.maxHp);

            // 효과 표시
            if (this.effects.length > 0) {
                const effect = this.effects[0];
                if (effect.type === 'slow') {
                    Sentinel.utils.fillCircle(ctx, this.x, this.y + this.size + 6, 3, '#64B5F6', 0.8);
                }
            }

            // Healer 힐 범위 표시 (선택)
            if (this.type === 'healer' && Sentinel.game.debugMode) {
                Sentinel.utils.drawCircle(ctx, this.x, this.y, this.data.healRadius, this.color, 0.2);
            }
        }
    }

    Sentinel.classes.Enemy = Enemy;
    console.log('[Sentinel] Enemy loaded');
})();
