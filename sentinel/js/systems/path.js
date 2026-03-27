(function() {
    'use strict';
    var S = window.Sentinel;

    // PathSystem converts grid waypoints to pixel positions and manages enemy movement along paths
    S.PathSystem = {
        // Build pixel-coordinate path from a map's waypoint array
        buildPath: function(mapData) {
            var cellSize = mapData.cellSize;
            var offsetX = mapData.offsetX || 0;
            var offsetY = mapData.offsetY || 0;
            var result = [];

            for (var p = 0; p < mapData.paths.length; p++) {
                var waypoints = mapData.paths[p];
                var pixelPath = [];
                for (var i = 0; i < waypoints.length; i++) {
                    var wp = waypoints[i];
                    pixelPath.push({
                        x: S.GAME_BOARD_X + offsetX + wp[0] * cellSize + cellSize / 2,
                        y: S.GAME_BOARD_Y + offsetY + wp[1] * cellSize + cellSize / 2
                    });
                }
                result.push(pixelPath);
            }
            return result;
        },

        // Get total path length in pixels for a given path index
        getPathLength: function(pixelPaths, pathIndex) {
            var path = pixelPaths[pathIndex || 0];
            var len = 0;
            for (var i = 1; i < path.length; i++) {
                var dx = path[i].x - path[i-1].x;
                var dy = path[i].y - path[i-1].y;
                len += Math.sqrt(dx * dx + dy * dy);
            }
            return len;
        },

        // Get position and direction along a path given distance traveled
        getPositionAtDistance: function(pixelPath, distance) {
            var accumulated = 0;
            for (var i = 1; i < pixelPath.length; i++) {
                var dx = pixelPath[i].x - pixelPath[i-1].x;
                var dy = pixelPath[i].y - pixelPath[i-1].y;
                var segLen = Math.sqrt(dx * dx + dy * dy);

                if (accumulated + segLen >= distance) {
                    var t = (distance - accumulated) / segLen;
                    return {
                        x: pixelPath[i-1].x + dx * t,
                        y: pixelPath[i-1].y + dy * t,
                        angle: Math.atan2(dy, dx),
                        segIndex: i,
                        finished: false
                    };
                }
                accumulated += segLen;
            }

            // Past end of path
            var last = pixelPath[pixelPath.length - 1];
            return {
                x: last.x,
                y: last.y,
                angle: 0,
                segIndex: pixelPath.length - 1,
                finished: true
            };
        },

        // Assign a random path index for maps with multiple paths
        getRandomPathIndex: function(pixelPaths) {
            return Math.floor(Math.random() * pixelPaths.length);
        }
    };
})();
