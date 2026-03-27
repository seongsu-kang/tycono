// Sentinel - Tower Class (handoff.md 비주얼 반영)

(function() {
    'use strict';

    var LEVEL_RADIUS = [18, 20, 22];

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
            this.shootAnim = 0;
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
            var radius = LEVEL_RADIUS[this.level - 1];
            var shootScale = this.shootAnim > 0 ? 1.15 : 1.0;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.scale(shootScale, shootScale);
            Sentinel.utils.renderTowerIcon(ctx, this.type, 0, 0, radius, this.level);
            ctx.restore();

            // 레벨 표시
            if (this.level > 1) {
                var stars = '';
                for (var i = 0; i < this.level; i++) stars += '★';
                Sentinel.utils.drawText(ctx, stars, this.x, this.y + radius + 10, 9, Sentinel.colors.goldYellow);
            }

            // 선택 표시 + 사거리
            if (this.selected) {
                Sentinel.utils.renderRangePreview(ctx, this.x, this.y, this.stats.range, true);
            }
        }
    }

    Sentinel.classes.Tower = Tower;
})();
