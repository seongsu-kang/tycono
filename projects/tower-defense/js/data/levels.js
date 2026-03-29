// Level Data - 5 levels with increasing difficulty
// Grid: 0 = buildable, 1 = path, 2 = unbuildable
// Grid size: 20 columns x 15 rows (800x600 game area, tile 40px)

window.LEVEL_DATA = [
  // Level 1: Straight path (left to right)
  {
    id: 1,
    name: 'The Meadow',
    description: 'A straight path through the meadow. Perfect for learning.',
    startGold: 200,
    lives: 20,
    grid: (function() {
      var g = [];
      for (var r = 0; r < 15; r++) {
        g[r] = [];
        for (var c = 0; c < 20; c++) {
          g[r][c] = (r === 7) ? 1 : 0;
        }
      }
      return g;
    })(),
    path: (function() {
      var p = [];
      for (var c = 0; c < 20; c++) {
        p.push({ x: c * 40 + 20, y: 7 * 40 + 20 });
      }
      return p;
    })(),
    waves: [
      { enemies: [{ type: 'normal', count: 5, interval: 1200 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 8, interval: 1000 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 12, interval: 800 }], delay: 0 }
    ]
  },

  // Level 2: L-shaped path
  {
    id: 2,
    name: 'The Bend',
    description: 'An L-shaped path. Wolves appear!',
    startGold: 250,
    lives: 18,
    grid: (function() {
      var g = [];
      for (var r = 0; r < 15; r++) {
        g[r] = [];
        for (var c = 0; c < 20; c++) {
          g[r][c] = 0;
        }
      }
      // Horizontal top part (row 3, cols 0-12)
      for (var c = 0; c < 13; c++) g[3][c] = 1;
      // Vertical right part (rows 3-13, col 12)
      for (var r = 3; r < 14; r++) g[r][12] = 1;
      // Horizontal bottom (row 13, cols 12-19)
      for (var c = 12; c < 20; c++) g[13][c] = 1;
      return g;
    })(),
    path: (function() {
      var p = [];
      for (var c = 0; c < 13; c++) p.push({ x: c * 40 + 20, y: 3 * 40 + 20 });
      for (var r = 4; r < 14; r++) p.push({ x: 12 * 40 + 20, y: r * 40 + 20 });
      for (var c = 13; c < 20; c++) p.push({ x: c * 40 + 20, y: 13 * 40 + 20 });
      return p;
    })(),
    waves: [
      { enemies: [{ type: 'normal', count: 8, interval: 1000 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 6, interval: 1000 }, { type: 'fast', count: 4, interval: 800 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 8, interval: 700 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 10, interval: 800 }, { type: 'fast', count: 5, interval: 600 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 12, interval: 600 }, { type: 'fast', count: 8, interval: 500 }], delay: 0 }
    ]
  },

  // Level 3: S-shaped winding path
  {
    id: 3,
    name: 'Serpentine',
    description: 'A winding S-path. Golems lumber through.',
    startGold: 300,
    lives: 15,
    grid: (function() {
      var g = [];
      for (var r = 0; r < 15; r++) {
        g[r] = [];
        for (var c = 0; c < 20; c++) g[r][c] = 0;
      }
      // S-shape: top row 2 (cols 0-17), down col 17 (rows 2-6), middle row 6 (cols 3-17), down col 3 (rows 6-10), bottom row 10 (cols 3-19)
      for (var c = 0; c < 18; c++) g[2][c] = 1;
      for (var r = 2; r <= 6; r++) g[r][17] = 1;
      for (var c = 3; c <= 17; c++) g[6][c] = 1;
      for (var r = 6; r <= 10; r++) g[r][3] = 1;
      for (var c = 3; c < 20; c++) g[10][c] = 1;
      return g;
    })(),
    path: (function() {
      var p = [];
      for (var c = 0; c < 18; c++) p.push({ x: c * 40 + 20, y: 2 * 40 + 20 });
      for (var r = 3; r <= 6; r++) p.push({ x: 17 * 40 + 20, y: r * 40 + 20 });
      for (var c = 16; c >= 3; c--) p.push({ x: c * 40 + 20, y: 6 * 40 + 20 });
      for (var r = 7; r <= 10; r++) p.push({ x: 3 * 40 + 20, y: r * 40 + 20 });
      for (var c = 4; c < 20; c++) p.push({ x: c * 40 + 20, y: 10 * 40 + 20 });
      return p;
    })(),
    waves: [
      { enemies: [{ type: 'normal', count: 10, interval: 900 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 8, interval: 800 }, { type: 'fast', count: 5, interval: 600 }], delay: 0 },
      { enemies: [{ type: 'tank', count: 3, interval: 2000 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 10, interval: 700 }, { type: 'tank', count: 2, interval: 2500 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 10, interval: 500 }, { type: 'tank', count: 3, interval: 1800 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 15, interval: 500 }, { type: 'fast', count: 8, interval: 400 }, { type: 'tank', count: 4, interval: 1500 }], delay: 0 },
      { enemies: [{ type: 'tank', count: 8, interval: 1200 }], delay: 0 }
    ]
  },

  // Level 4: Long detour path
  {
    id: 4,
    name: 'The Labyrinth',
    description: 'A complex detour. All enemy types appear.',
    startGold: 350,
    lives: 12,
    grid: (function() {
      var g = [];
      for (var r = 0; r < 15; r++) {
        g[r] = [];
        for (var c = 0; c < 20; c++) g[r][c] = 0;
      }
      // Complex zigzag
      for (var c = 0; c < 16; c++) g[1][c] = 1;
      for (var r = 1; r <= 4; r++) g[r][15] = 1;
      for (var c = 4; c <= 15; c++) g[4][c] = 1;
      for (var r = 4; r <= 7; r++) g[r][4] = 1;
      for (var c = 4; c < 17; c++) g[7][c] = 1;
      for (var r = 7; r <= 10; r++) g[r][16] = 1;
      for (var c = 2; c <= 16; c++) g[10][c] = 1;
      for (var r = 10; r <= 13; r++) g[r][2] = 1;
      for (var c = 2; c < 20; c++) g[13][c] = 1;
      return g;
    })(),
    path: (function() {
      var p = [];
      for (var c = 0; c < 16; c++) p.push({ x: c * 40 + 20, y: 1 * 40 + 20 });
      for (var r = 2; r <= 4; r++) p.push({ x: 15 * 40 + 20, y: r * 40 + 20 });
      for (var c = 14; c >= 4; c--) p.push({ x: c * 40 + 20, y: 4 * 40 + 20 });
      for (var r = 5; r <= 7; r++) p.push({ x: 4 * 40 + 20, y: r * 40 + 20 });
      for (var c = 5; c <= 16; c++) p.push({ x: c * 40 + 20, y: 7 * 40 + 20 });
      for (var r = 8; r <= 10; r++) p.push({ x: 16 * 40 + 20, y: r * 40 + 20 });
      for (var c = 15; c >= 2; c--) p.push({ x: c * 40 + 20, y: 10 * 40 + 20 });
      for (var r = 11; r <= 13; r++) p.push({ x: 2 * 40 + 20, y: r * 40 + 20 });
      for (var c = 3; c < 20; c++) p.push({ x: c * 40 + 20, y: 13 * 40 + 20 });
      return p;
    })(),
    waves: [
      { enemies: [{ type: 'normal', count: 12, interval: 800 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 10, interval: 600 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 8, interval: 700 }, { type: 'fast', count: 6, interval: 500 }], delay: 0 },
      { enemies: [{ type: 'tank', count: 5, interval: 1500 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 15, interval: 500 }, { type: 'tank', count: 3, interval: 1800 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 12, interval: 400 }, { type: 'tank', count: 4, interval: 1200 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 10, interval: 600 }, { type: 'fast', count: 10, interval: 400 }, { type: 'tank', count: 5, interval: 1000 }], delay: 0 },
      { enemies: [{ type: 'tank', count: 8, interval: 1000 }, { type: 'fast', count: 15, interval: 300 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 20, interval: 300 }, { type: 'fast', count: 12, interval: 300 }, { type: 'tank', count: 6, interval: 800 }], delay: 0 }
    ]
  },

  // Level 5: Complex path with boss
  {
    id: 5,
    name: 'Dragon\'s Lair',
    description: 'The final challenge. The Dragon awaits.',
    startGold: 400,
    lives: 10,
    grid: (function() {
      var g = [];
      for (var r = 0; r < 15; r++) {
        g[r] = [];
        for (var c = 0; c < 20; c++) g[r][c] = 0;
      }
      // Spiral-like path
      for (var c = 0; c < 18; c++) g[1][c] = 1;
      for (var r = 1; r <= 5; r++) g[r][17] = 1;
      for (var c = 3; c <= 17; c++) g[5][c] = 1;
      for (var r = 5; r <= 9; r++) g[r][3] = 1;
      for (var c = 3; c <= 17; c++) g[9][c] = 1;
      for (var r = 9; r <= 13; r++) g[r][17] = 1;
      for (var c = 7; c <= 17; c++) g[13][c] = 1;
      for (var r = 11; r <= 13; r++) g[r][7] = 1;
      for (var c = 7; c <= 13; c++) g[11][c] = 1;
      return g;
    })(),
    path: (function() {
      var p = [];
      for (var c = 0; c < 18; c++) p.push({ x: c * 40 + 20, y: 1 * 40 + 20 });
      for (var r = 2; r <= 5; r++) p.push({ x: 17 * 40 + 20, y: r * 40 + 20 });
      for (var c = 16; c >= 3; c--) p.push({ x: c * 40 + 20, y: 5 * 40 + 20 });
      for (var r = 6; r <= 9; r++) p.push({ x: 3 * 40 + 20, y: r * 40 + 20 });
      for (var c = 4; c <= 17; c++) p.push({ x: c * 40 + 20, y: 9 * 40 + 20 });
      for (var r = 10; r <= 13; r++) p.push({ x: 17 * 40 + 20, y: r * 40 + 20 });
      for (var c = 16; c >= 7; c--) p.push({ x: c * 40 + 20, y: 13 * 40 + 20 });
      for (var r = 12; r >= 11; r--) p.push({ x: 7 * 40 + 20, y: r * 40 + 20 });
      for (var c = 8; c <= 13; c++) p.push({ x: c * 40 + 20, y: 11 * 40 + 20 });
      return p;
    })(),
    waves: [
      { enemies: [{ type: 'normal', count: 15, interval: 700 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 12, interval: 500 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 10, interval: 600 }, { type: 'fast', count: 8, interval: 400 }], delay: 0 },
      { enemies: [{ type: 'tank', count: 6, interval: 1200 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 12, interval: 500 }, { type: 'tank', count: 4, interval: 1000 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 15, interval: 300 }, { type: 'tank', count: 5, interval: 800 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 15, interval: 400 }, { type: 'fast', count: 10, interval: 300 }, { type: 'tank', count: 6, interval: 700 }], delay: 0 },
      { enemies: [{ type: 'tank', count: 10, interval: 800 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 20, interval: 250 }, { type: 'fast', count: 15, interval: 250 }, { type: 'tank', count: 8, interval: 600 }], delay: 0 },
      { enemies: [{ type: 'fast', count: 20, interval: 200 }, { type: 'tank', count: 5, interval: 1000 }], delay: 0 },
      { enemies: [{ type: 'normal', count: 20, interval: 300 }, { type: 'fast', count: 15, interval: 200 }, { type: 'tank', count: 10, interval: 500 }], delay: 0 },
      { enemies: [{ type: 'boss', count: 3, interval: 5000 }, { type: 'tank', count: 8, interval: 1000 }, { type: 'fast', count: 20, interval: 200 }], delay: 0 }
    ]
  }
];
