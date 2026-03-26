// Sentinel - Projectile Class

(function() {
    'use strict';

    class Projectile {
        constructor(tower, target, damage, splash, slow, slowDuration) {
            this.x = tower.x;
            this.y = tower.y;
            this.target = target;
            this.damage = damage;
            this.splash = splash || 0;
            this.slow = slow || 0;
            this.slowDuration = slowDuration || 0;
            this.speed = tower.data.projectileSpeed;
            this.color = tower.data.projectileColor;
            this.active = true;
            this.size = 4;

            // Sniper instant 레이저
            this.instant = tower.stats.instant || false;
            if (this.instant) {
                this.onHit();
                this.active = false;

                // 레이저 이펙트
                if (Sentinel.game) {
                    Sentinel.game.effects.push({
                        type: 'laser',
                        x1: tower.x,
                        y1: tower.y,
                        x2: target.x,
                        y2: target.y,
                        color: this.color,
                        duration: 0.15,
                        elapsed: 0
                    });
                }
            }
        }

        update(dt) {
            if (this.instant) return; // instant는 update 불필요

            if (!this.target || !this.target.active) {
                this.active = false;
                return;
            }

            // 타겟을 향해 이동
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.speed * dt) {
                // 적중
                this.onHit();
                this.active = false;
            } else {
                // 이동
                const ratio = (this.speed * dt) / dist;
                this.x += dx * ratio;
                this.y += dy * ratio;
            }
        }

        onHit() {
            if (!this.target) return;

            // 직접 대미지
            this.target.takeDamage(this.damage);

            // 슬로우 효과
            if (this.slow > 0) {
                this.target.applyEffect({
                    type: 'slow',
                    multiplier: this.slow,
                    duration: this.slowDuration
                });
            }

            // 스플래시 대미지
            if (this.splash > 0) {
                const game = Sentinel.game;
                game.enemies.forEach(enemy => {
                    if (enemy !== this.target && enemy.active) {
                        const dist = Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y);
                        if (dist <= this.splash) {
                            enemy.takeDamage(this.damage); // 스플래시 100% 대미지
                        }
                    }
                });

                // 스플래시 이펙트
                game.effects.push({
                    type: 'explosion',
                    x: this.x,
                    y: this.y,
                    radius: this.splash,
                    color: this.color,
                    alpha: 0.6,
                    duration: 0.3,
                    elapsed: 0
                });
            }
        }

        render(ctx) {
            if (!this.active || this.instant) return; // instant는 render 불필요

            // 투사체 그리기 (원)
            Sentinel.utils.fillCircle(ctx, this.x, this.y, this.size, this.color);

            // 꼬리 효과 (선택)
            if (this.target) {
                const angle = Sentinel.utils.angleBetween(this.x, this.y, this.target.x, this.target.y);
                const tailLength = 8;
                const tailX = this.x - Math.cos(angle) * tailLength;
                const tailY = this.y - Math.sin(angle) * tailLength;

                ctx.save();
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(this.x, this.y);
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    Sentinel.classes.Projectile = Projectile;
    console.log('[Sentinel] Projectile loaded');
})();
