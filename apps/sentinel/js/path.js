// Sentinel - Path & Map Manager

(function() {
    'use strict';

    class PathManager {
        constructor() {
            this.grid = null;
            this.path = null;
            this.startPos = null;
            this.endPos = null;
            this.init();
        }

        init() {
            const w = Sentinel.config.gridWidth;
            const h = Sentinel.config.gridHeight;

            // 맵 정의 (0: 빈 공간, 1: 경로, 2: 시작점, 3: 끝점)
            this.grid = [
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
                [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
                [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
                [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            ];

            // 시작점과 끝점 찾기
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (this.grid[y][x] === 2) {
                        this.startPos = { gridX: x, gridY: y };
                        this.grid[y][x] = 1; // 경로로 변환
                    } else if (this.grid[y][x] === 3) {
                        this.endPos = { gridX: x, gridY: y };
                        this.grid[y][x] = 1; // 경로로 변환
                    }
                }
            }

            // 경로 계산 (BFS)
            this.path = this.calculatePath();
            console.log('[PathManager] Path calculated:', this.path.length, 'waypoints');
        }

        calculatePath() {
            const start = this.startPos;
            const end = this.endPos;
            const grid = this.grid;
            const w = Sentinel.config.gridWidth;
            const h = Sentinel.config.gridHeight;

            const queue = [{ x: start.gridX, y: start.gridY, path: [] }];
            const visited = new Set();
            visited.add(start.gridX + ',' + start.gridY);

            const directions = [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 }
            ];

            while (queue.length > 0) {
                const current = queue.shift();
                const currentPath = current.path.concat([{ gridX: current.x, gridY: current.y }]);

                // 도착 확인
                if (current.x === end.gridX && current.y === end.gridY) {
                    // 그리드 좌표를 월드 좌표로 변환
                    return currentPath.map(p => Sentinel.utils.gridToWorld(p.gridX, p.gridY));
                }

                // 인접 셀 탐색
                for (const dir of directions) {
                    const nx = current.x + dir.dx;
                    const ny = current.y + dir.dy;
                    const key = nx + ',' + ny;

                    if (nx >= 0 && nx < w && ny >= 0 && ny < h &&
                        grid[ny][nx] === 1 && !visited.has(key)) {
                        visited.add(key);
                        queue.push({ x: nx, y: ny, path: currentPath });
                    }
                }
            }

            console.error('[PathManager] Path not found!');
            return [];
        }

        isPathCell(gridX, gridY) {
            if (gridX < 0 || gridX >= Sentinel.config.gridWidth ||
                gridY < 0 || gridY >= Sentinel.config.gridHeight) {
                return false;
            }
            return this.grid[gridY][gridX] === 1;
        }

        canPlaceTower(gridX, gridY) {
            if (gridX < 0 || gridX >= Sentinel.config.gridWidth ||
                gridY < 0 || gridY >= Sentinel.config.gridHeight) {
                return false;
            }
            return this.grid[gridY][gridX] === 0;
        }

        render(ctx) {
            const cellSize = Sentinel.config.cellSize;
            const w = Sentinel.config.gridWidth;
            const h = Sentinel.config.gridHeight;

            // 그리드 배경
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, w * cellSize, h * cellSize);

            // 그리드 라인
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 1;
            for (let y = 0; y <= h; y++) {
                ctx.beginPath();
                ctx.moveTo(0, y * cellSize);
                ctx.lineTo(w * cellSize, y * cellSize);
                ctx.stroke();
            }
            for (let x = 0; x <= w; x++) {
                ctx.beginPath();
                ctx.moveTo(x * cellSize, 0);
                ctx.lineTo(x * cellSize, h * cellSize);
                ctx.stroke();
            }

            // 경로 렌더링
            ctx.fillStyle = '#654321';
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (this.grid[y][x] === 1) {
                        ctx.fillRect(x * cellSize + 2, y * cellSize + 2, cellSize - 4, cellSize - 4);
                    }
                }
            }

            // 시작점/끝점 표시
            if (this.startPos) {
                const start = Sentinel.utils.gridToWorld(this.startPos.gridX, this.startPos.gridY);
                Sentinel.utils.fillCircle(ctx, start.x, start.y, 10, '#00ff00');
            }
            if (this.endPos) {
                const end = Sentinel.utils.gridToWorld(this.endPos.gridX, this.endPos.gridY);
                Sentinel.utils.fillCircle(ctx, end.x, end.y, 10, '#ff0000');
            }
        }
    }

    Sentinel.classes.PathManager = PathManager;
    console.log('[Sentinel] PathManager loaded');
})();
