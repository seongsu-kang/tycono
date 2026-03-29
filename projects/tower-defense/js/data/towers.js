// Tower Data - 4 tower types with 3 upgrade levels each
window.TOWER_DATA = {
  arrow: {
    id: 'arrow',
    name: 'Arrow Tower',
    color: 0x8B4513,
    symbol: '→',
    levels: [
      { cost: 50, damage: 10, range: 150, fireRate: 1000, description: 'Basic arrow tower' },
      { cost: 75, damage: 13, range: 165, fireRate: 900, description: 'Improved arrows' },
      { cost: 112, damage: 17, range: 180, fireRate: 800, description: 'Master arrows' }
    ]
  },
  slow: {
    id: 'slow',
    name: 'Ice Tower',
    color: 0x00BFFF,
    symbol: '❄',
    slowAmount: 0.3,
    slowDuration: 3000,
    levels: [
      { cost: 75, damage: 5, range: 120, fireRate: 1500, description: 'Slows enemies 30%' },
      { cost: 112, damage: 7, range: 135, fireRate: 1350, description: 'Slows enemies 35%' },
      { cost: 168, damage: 9, range: 150, fireRate: 1200, description: 'Slows enemies 40%' }
    ]
  },
  splash: {
    id: 'splash',
    name: 'Cannon Tower',
    color: 0xFF4500,
    symbol: '💥',
    splashRadius: 50,
    levels: [
      { cost: 100, damage: 20, range: 130, fireRate: 2000, description: 'Area damage 50px' },
      { cost: 150, damage: 26, range: 145, fireRate: 1800, description: 'Area damage 60px' },
      { cost: 225, damage: 34, range: 160, fireRate: 1600, description: 'Area damage 70px' }
    ]
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Tower',
    color: 0x800080,
    symbol: '◎',
    levels: [
      { cost: 125, damage: 40, range: 250, fireRate: 3000, description: 'Long range sniper' },
      { cost: 187, damage: 52, range: 275, fireRate: 2700, description: 'Improved optics' },
      { cost: 280, damage: 68, range: 300, fireRate: 2400, description: 'Master sniper' }
    ]
  }
};

window.TOWER_SELL_RATIO = 0.6;
