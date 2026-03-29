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

// Unlocked levels (persisted in localStorage)
window.GameState = {
  unlockedLevel: parseInt(localStorage.getItem('td_unlocked') || '1', 10),
  unlockLevel: function(level) {
    if (level > this.unlockedLevel) {
      this.unlockedLevel = level;
      localStorage.setItem('td_unlocked', String(level));
    }
  }
};
