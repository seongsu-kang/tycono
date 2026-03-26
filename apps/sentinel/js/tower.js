// Sentinel - Tower Class

(function() {
    'use strict';

    class Tower {
        constructor(type, gridX, gridY) {
            this.type = type;
            this.data = Sentinel.data.towers[type];
            this.gridX = gridX;
            this.gridY = gridY;

            const pos = Sentinel.utils.gridToWorld(gridX, gridY);
            this.x = pos.x;
            this.y = pos.y;

            this.level = 1;
            this.stats = this.data.levels[0];

            this.fireTimer = 0;
            this.target = null;
            this.angle = 0;

            this.selected = false;
        }

        update(dt, enemies) {
            this.fireTimer += dt;

            // 타겟 찾기
            if (!this.target || !this.target.active || !this.isInRange(this.target)) {
                this.target = this.findTarget(enemies);
            }

            // 발사
            if (this.target && this.fireTimer >= this.stats.fireRate) {
                this.fire();
                this.fireTimer = 0;
            }

            // 각도 업데이트 (타겟을 향해)
            if (this.target) {
                this.angle = Sentinel.utils.angleBetween(this.x, this.y, this.target.x, this.target.y);
            }
        }

        findTarget(enemies) {
            let closest = null;
            let minDist = Infinity;

            for (const enemy of enemies) {
                if (!enemy.active) continue;

                const dist = Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y);
                if (dist <= this.stats.range) {
                    // 가장 앞에 있는 적 (pathIndex가 큰 적) 우선
                    if (enemy.pathIndex > (closest ? closest.pathIndex : -1)) {
                        closest = enemy;
                        minDist = dist;
                    } else if (enemy.pathIndex === (closest ? closest.pathIndex : -1) && dist < minDist) {
                        closest = enemy;
                        minDist = dist;
                    }
                }
            }

            return closest;
        }

        isInRange(enemy) {
            const dist = Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y);
            return dist <= this.stats.range;
        }

        fire() {
            if (!this.target) return;

            const projectile = new Sentinel.classes.Projectile(
                this,
                this.target,
                this.stats.damage,
                this.stats.splash,
                this.stats.slow,
                this.stats.slowDuration
            );

            Sentinel.game.projectiles.push(projectile);
        }

        upgrade() {
            if (this.level >= 3) return false;

            const cost = this.stats.upgradeCost;
            if (Sentinel.game.gold < cost) return false;

            Sentinel.game.gold -= cost;
            this.level++;
            this.stats = this.data.levels[this.level - 1];
            return true;
        }

        getSellValue() {
            let total = this.data.baseCost;
            for (let i = 0; i < this.level - 1; i++) {
                total += this.data.levels[i].upgradeCost;
            }
            return Math.floor(total * 0.6); // 60% 환불
        }

        render(ctx) {
            // 타워 베이스 (육각형)
            const baseSize = Sentinel.config.cellSize * 0.35;
            ctx.save();
            ctx.fillStyle = this.data.color;
            ctx.translate(this.x, this.y);
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i;
                const x = Math.cos(angle) * baseSize;
                const y = Math.sin(angle) * baseSize;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // 포신 (타겟 방향)
            const barrelLength = baseSize * 1.3;
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.angle);
            ctx.fillStyle = this.data.color;
            ctx.fillRect(0, -3, barrelLength, 6);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(0, -3, barrelLength, 6);
            ctx.restore();

            // 레벨 표시
            if (this.level > 1) {
                const levelText = 'Lv' + this.level;
                Sentinel.utils.drawText(ctx, levelText, this.x, this.y + baseSize + 10, 10, '#ffffff');
            }

            // 선택 표시
            if (this.selected) {
                ctx.save();
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, baseSize + 5, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // 사거리 표시
                Sentinel.utils.drawCircle(ctx, this.x, this.y, this.stats.range, '#ffff00', 0.5);
            }
        }
    }

    Sentinel.classes.Tower = Tower;
    console.log('[Sentinel] Tower loaded');
})();
