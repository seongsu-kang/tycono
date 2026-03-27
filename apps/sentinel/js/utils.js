// Sentinel - Utility Functions + Shared Render Helpers

(function() {
    'use strict';

    var utils = Sentinel.utils;

    utils.distance = function(x1, y1, x2, y2) {
        var dx = x2 - x1; var dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    };

    utils.gridToWorld = function(gridX, gridY) {
        var s = Sentinel.config.cellSize;
        return { x: gridX * s + s / 2, y: gridY * s + s / 2 };
    };

    utils.worldToGrid = function(x, y) {
        var s = Sentinel.config.cellSize;
        return { gridX: Math.floor(x / s), gridY: Math.floor(y / s) };
    };

    utils.angleBetween = function(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    };

    utils.lerp = function(a, b, t) { return a + (b - a) * t; };

    utils.drawCircle = function(ctx, x, y, radius, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha || 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    };

    utils.fillCircle = function(ctx, x, y, radius, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha || 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    utils.drawText = function(ctx, text, x, y, size, color, align, baseline) {
        ctx.save();
        ctx.font = size + 'px Arial, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = baseline || 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    };

    // HP 바 (style-guide 색상: 70%/#00ff99, 30%/#ffaa00, else #ff4444)
    utils.drawHealthBar = function(ctx, x, y, width, height, current, max) {
        var ratio = Math.max(0, Math.min(1, current / max));
        var colors = Sentinel.colors;

        ctx.fillStyle = '#333333';
        ctx.fillRect(x - width / 2, y - height / 2, width, height);

        if (ratio > 0.7) ctx.fillStyle = colors.electricGreen;
        else if (ratio > 0.3) ctx.fillStyle = colors.warningOrange;
        else ctx.fillStyle = colors.dangerRed;

        ctx.fillRect(x - width / 2, y - height / 2, width * ratio, height);
    };

    // 사거리 미리보기 (점선 원, style-guide §7.3)
    utils.renderRangePreview = function(ctx, cx, cy, range, canPlace) {
        ctx.save();
        if (canPlace) {
            ctx.fillStyle = '#00d9ff22';
            ctx.strokeStyle = '#00d9ff';
        } else {
            ctx.fillStyle = '#ff444422';
            ctx.strokeStyle = '#ff4444';
        }
        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    };

    // ═══════════════════════════════════════════════
    // 타워 아이콘 렌더링 (handoff.md 기준)
    // ═══════════════════════════════════════════════

    utils.renderTowerIcon = function(ctx, towerType, x, y, radius, level) {
        switch (towerType) {
            case 'arrow': utils._renderArrowTower(ctx, x, y, radius, level); break;
            case 'cannon': utils._renderCannonTower(ctx, x, y, radius, level); break;
            case 'slow': utils._renderSlowTower(ctx, x, y, radius, level); break;
            case 'sniper': utils._renderSniperTower(ctx, x, y, radius, level); break;
        }
    };

    utils._renderArrowTower = function(ctx, x, y, radius, level) {
        var colors = ['#00ff99', '#00ffaa', '#00ffbb'];
        var color = colors[level - 1] || colors[0];

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x - radius, y + radius);
        ctx.lineTo(x + radius, y + radius);
        ctx.closePath();
        ctx.fill();

        if (level >= 2) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        if (level >= 3) {
            var ir = radius * 0.6;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(x, y - ir);
            ctx.lineTo(x - ir, y + ir);
            ctx.lineTo(x + ir, y + ir);
            ctx.closePath();
            ctx.fill();
        }
    };

    utils._renderCannonTower = function(ctx, x, y, radius, level) {
        var colors = ['#ff6600', '#ff7711', '#ff8822'];
        var color = colors[level - 1] || colors[0];

        ctx.fillStyle = color;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

        var br = radius * 0.2;
        var barrelCount = level;
        for (var i = 0; i < barrelCount; i++) {
            var offsetX = (i - (barrelCount - 1) / 2) * br * 2.5;
            ctx.beginPath();
            ctx.arc(x + offsetX, y - radius - br, br, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    utils._renderSlowTower = function(ctx, x, y, radius, level) {
        var colors = ['#00aaff', '#00bbff', '#00ccff'];
        var color = colors[level - 1] || colors[0];

        ctx.fillStyle = color;
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
            var angle = (Math.PI / 3) * i;
            var px = x + Math.cos(angle) * radius;
            var py = y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        if (level >= 2) {
            var ir = radius * 0.6;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (var j = 0; j < 6; j++) {
                var a = (Math.PI / 3) * j;
                var ppx = x + Math.cos(a) * ir;
                var ppy = y + Math.sin(a) * ir;
                if (j === 0) ctx.moveTo(ppx, ppy); else ctx.lineTo(ppx, ppy);
            }
            ctx.closePath();
            ctx.stroke();
        }
    };

    utils._renderSniperTower = function(ctx, x, y, radius, level) {
        var colors = ['#ff00aa', '#ff11bb', '#ff22cc'];
        var color = colors[level - 1] || colors[0];

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius, y);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        var crossCount = level;
        for (var i = 0; i < crossCount; i++) {
            var size = radius * 0.6 - i * 8;
            if (size < 2) size = 2;
            ctx.beginPath();
            ctx.moveTo(x - size, y);
            ctx.lineTo(x + size, y);
            ctx.moveTo(x, y - size);
            ctx.lineTo(x, y + size);
            ctx.stroke();
        }
    };

    console.log('[Sentinel] Utils loaded');
})();
