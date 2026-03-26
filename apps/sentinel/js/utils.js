// Sentinel - Utility Functions

(function() {
    'use strict';

    const utils = Sentinel.utils;

    // 거리 계산
    utils.distance = function(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    };

    // 그리드 좌표 → 월드 좌표 (셀 중심)
    utils.gridToWorld = function(gridX, gridY) {
        const cellSize = Sentinel.config.cellSize;
        return {
            x: gridX * cellSize + cellSize / 2,
            y: gridY * cellSize + cellSize / 2
        };
    };

    // 월드 좌표 → 그리드 좌표
    utils.worldToGrid = function(x, y) {
        const cellSize = Sentinel.config.cellSize;
        return {
            gridX: Math.floor(x / cellSize),
            gridY: Math.floor(y / cellSize)
        };
    };

    // 각도 계산 (라디안)
    utils.angleBetween = function(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    };

    // 선형 보간
    utils.lerp = function(a, b, t) {
        return a + (b - a) * t;
    };

    // 범위 내 랜덤 정수
    utils.randomInt = function(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    // 배열에서 랜덤 요소
    utils.randomChoice = function(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    };

    // HP 바 그리기
    utils.drawHealthBar = function(ctx, x, y, width, height, current, max) {
        const ratio = Math.max(0, Math.min(1, current / max));

        // 배경 (빨간색)
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(x - width / 2, y - height / 2, width, height);

        // HP (초록색 → 노란색 → 빨간색)
        if (ratio > 0.5) {
            ctx.fillStyle = '#00ff00';
        } else if (ratio > 0.25) {
            ctx.fillStyle = '#ffff00';
        } else {
            ctx.fillStyle = '#ff6600';
        }
        ctx.fillRect(x - width / 2, y - height / 2, width * ratio, height);

        // 테두리
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - width / 2, y - height / 2, width, height);
    };

    // 숫자 포맷팅 (1000 → 1,000)
    utils.formatNumber = function(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    // 원 그리기 (사거리 표시 등)
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

    // 채워진 원 그리기
    utils.fillCircle = function(ctx, x, y, radius, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha || 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    // 텍스트 그리기 (중앙 정렬)
    utils.drawText = function(ctx, text, x, y, size, color, align, baseline) {
        ctx.save();
        ctx.font = size + 'px Arial, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = baseline || 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    };

    // 텍스트 배경과 함께 그리기
    utils.drawTextWithBg = function(ctx, text, x, y, size, textColor, bgColor, padding) {
        padding = padding || 5;
        ctx.font = size + 'px Arial, sans-serif';
        const metrics = ctx.measureText(text);
        const width = metrics.width + padding * 2;
        const height = size + padding * 2;

        // 배경
        ctx.fillStyle = bgColor;
        ctx.fillRect(x - width / 2, y - height / 2, width, height);

        // 텍스트
        utils.drawText(ctx, text, x, y, size, textColor);
    };

    console.log('[Sentinel] Utils loaded');
})();
