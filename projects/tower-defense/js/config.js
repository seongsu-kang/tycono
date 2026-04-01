// Game Configuration
window.GAME_CONFIG = {
  TILE_SIZE: 40,
  GRID_COLS: 20,
  GRID_ROWS: 15,
  GAME_WIDTH: 800,
  GAME_HEIGHT: 600,
  UI_WIDTH: 200,
  TOTAL_WIDTH: 1000,
  TOTAL_HEIGHT: 600
};

// Unlocked levels (localStorage with fallback for file:// restrictions)
window.GameState = (function() {
  var stored = 1;
  try { stored = parseInt(localStorage.getItem('td_unlocked') || '1', 10); } catch(e) {}
  return {
    unlockedLevel: stored,
    unlockLevel: function(level) {
      if (level > this.unlockedLevel) {
        this.unlockedLevel = level;
        try { localStorage.setItem('td_unlocked', String(level)); } catch(e) {}
      }
    }
  };
})();
