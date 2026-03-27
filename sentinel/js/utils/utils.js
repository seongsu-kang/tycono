(function() {
    'use strict';
    var S = window.Sentinel;

    S.Utils = {
        dist: function(x1, y1, x2, y2) {
            var dx = x2 - x1, dy = y2 - y1;
            return Math.sqrt(dx * dx + dy * dy);
        },

        gridDist: function(c1, r1, c2, r2) {
            var dx = c2 - c1, dy = r2 - r1;
            return Math.sqrt(dx * dx + dy * dy);
        },

        lerp: function(a, b, t) {
            return a + (b - a) * t;
        },

        clamp: function(v, min, max) {
            return v < min ? min : v > max ? max : v;
        },

        cellToPixel: function(col, row, map) {
            var cellSize = map.cellSize;
            var offsetX = map.offsetX || 0;
            var offsetY = map.offsetY || 0;
            return {
                x: S.GAME_BOARD_X + offsetX + col * cellSize + cellSize / 2,
                y: S.GAME_BOARD_Y + offsetY + row * cellSize + cellSize / 2
            };
        },

        pixelToCell: function(px, py, map) {
            var cellSize = map.cellSize;
            var offsetX = map.offsetX || 0;
            var offsetY = map.offsetY || 0;
            return {
                col: Math.floor((px - S.GAME_BOARD_X - offsetX) / cellSize),
                row: Math.floor((py - S.GAME_BOARD_Y - offsetY) / cellSize)
            };
        },

        lightenColor: function(hex, amount) {
            amount = amount || 34;
            var num = parseInt(hex.slice(1), 16);
            var r = Math.min(255, ((num >> 16) & 0xff) + amount);
            var g = Math.min(255, ((num >> 8) & 0xff) + amount);
            var b = Math.min(255, (num & 0xff) + amount);
            return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
        },

        darkenColor: function(hex, amount) {
            amount = amount || 34;
            var num = parseInt(hex.slice(1), 16);
            var r = Math.max(0, ((num >> 16) & 0xff) - amount);
            var g = Math.max(0, ((num >> 8) & 0xff) - amount);
            var b = Math.max(0, (num & 0xff) - amount);
            return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
        },

        colorAlpha: function(hex, alpha) {
            var a = Math.round(alpha * 255).toString(16).padStart(2, '0');
            return hex + a;
        },

        randomRange: function(min, max) {
            return min + Math.random() * (max - min);
        },

        angleToTarget: function(x1, y1, x2, y2) {
            return Math.atan2(y2 - y1, x2 - x1);
        },

        pointInRect: function(px, py, rx, ry, rw, rh) {
            return px >= rx && px < rx + rw && py >= ry && py < ry + rh;
        },

        formatTime: function(seconds) {
            var m = Math.floor(seconds / 60);
            var s = Math.floor(seconds % 60);
            return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        },

        // Deep clone for data objects
        clone: function(obj) {
            return JSON.parse(JSON.stringify(obj));
        }
    };
})();
