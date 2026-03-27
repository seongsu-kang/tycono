// Sentinel - Tower Class (폴리싱 버전)

(function() {
    'use strict';

    class Tower {
        constructor(type, gridX, gridY) {
            this.type = type;
            this.data = Sentinel.data.towers[type];
            this.gridX = gridX;
            this.gridY = gridY;

            var pos = Sentinel.utils.gridToWorld(gridX, gridY);
            this.x = pos.x;
            this.y = pos.y;

            this.level = 1;
            this.stats = this.data.levels[0];

            this.fireTimer = 0;
            this.target = null;
            this.angle = 0;
            this.selected = false;
            this.shootAnim = 0; // 발사 애니메이션 타이머
        }

        update(dt, enemies) {
            this.fireTimer += dt;
            if (this.shootAnim > 0) this.shootAnim -= dt;

            if (!this.target || !this.target.active || !this.isInRange(this.target)) {
                this.target = this.findTarget(enemies);
            }

            if (this.target && this.fireTimer >= this.stats.fireRate) {
                this.fire();
                this.fireTimer = 0;
                this.shootAnim = 0.1;
            }

            if (this.target) {
                this.angle = Sentinel.utils.angleBetween(this.x, this.y, this.target.x, this.target.y);
            }
        }

        findTarget(enemies) {
            if (this.type === 'sniper') {
                var highestHp = null;
                var maxHp = -1;
                for (var i = 0; i < enemies.length; i++) {
                    var enemy = enemies[i];
                    if (!enemy.active) continue;
                    var dist = Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y);
                    if (dist <= this.stats.range && enemy.hp > maxHp) {
                        highestHp = enemy;
                        maxHp = enemy.hp;
                    }
                }
                return highestHp;
            }

            var closest = null;
            var bestPathIndex = -1;
            var bestDist = Infinity;

            for (var i = 0; i < enemies.length; i++) {
                var enemy = enemies[i];
                if (!enemy.active) continue;
                var dist = Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y);
                if (dist <= this.stats.range) {
                    if (enemy.pathIndex > bestPathIndex || (enemy.pathIndex === bestPathIndex && dist < bestDist)) {
                        closest = enemy;
                        bestPathIndex = enemy.pathIndex;
                        bestDist = dist;
                    }
                }
            }
            return closest;
        }

        isInRange(enemy) {
            return Sentinel.utils.distance(this.x, this.y, enemy.x, enemy.y) <= this.stats.range;
        }

        fire() {
            if (!this.target) return;

            var projectile = new Sentinel.classes.Projectile(
                this, this.target, this.stats.damage,
                this.stats.splash, this.stats.slow, this.stats.slowDuration
            );
            Sentinel.game.projectiles.push(projectile);
            Sentinel.managers.audio.playShoot();
        }

        upgrade() {
            if (this.level >= 3) return false;
            var cost = this.stats.upgradeCost;
            if (Sentinel.game.gold < cost) return false;
            Sentinel.game.gold -= cost;
            this.level++;
            this.stats = this.data.levels[this.level - 1];
            return true;
        }

        getSellValue() {
            var total = this.data.baseCost;
            for (var i = 0; i < this.level - 1; i++) {
                total += this.data.levels[i].upgradeCost;
            }
            return Math.floor(total * 0.75);
        }

        render(ctx) {
            var baseSize = Sentinel.config.cellSize * 0.35;
            var shootScale = this.shootAnim > 0 ? 1.15 : 1.0;

            // 타워 베이스 (육각형)
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.scale(shootScale, shootScale);

            ctx.fillStyle = this.data.color;
            ctx.beginPath();
            for (var i = 0; i < 6; i++) {
                var angle = (Math.PI / 3) * i;
                var px = Math.cos(angle) * baseSize;
                var py = Math.sin(angle) * baseSize;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // 포신
            var barrelLength = baseSize * 1.3;
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
                var stars = '';
                for (var i = 0; i < this.level; i++) stars += '★';
                Sentinel.utils.drawText(ctx, stars, this.x, this.y + baseSize + 10, 9, Sentinel.colors.goldYellow);
            }

            // 선택 표시
            if (this.selected) {
                ctx.save();
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 3]);
                ctx.beginPath();
                ctx.arc(this.x, this.y, baseSize + 8, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();

                Sentinel.utils.drawCircle(ctx, this.x, this.y, this.stats.range, this.data.color, 0.25);
            }
        }
    }

    Sentinel.classes.Tower = Tower;
})();
