var GameScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function GameScene() {
    Phaser.Scene.call(this, { key: 'GameScene' });
  },

  init: function(data) {
    this.levelIndex = data.levelIndex || 0;
    this.levelData = LEVEL_DATA[this.levelIndex];
    this.gold = this.levelData.startGold;
    this.lives = this.levelData.lives;
    this.currentWave = 0;
    this.waveActive = false;
    this.enemiesAlive = 0;
    this.enemiesSpawned = 0;
    this.totalEnemiesInWave = 0;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.paused = false;
    this.gameSpeed = 1;
    this.gameOver = false;
    this.spawnTimers = [];
    this.grid = [];
    // Deep copy grid
    for (var r = 0; r < GAME_CONFIG.GRID_ROWS; r++) {
      this.grid[r] = [];
      for (var c = 0; c < GAME_CONFIG.GRID_COLS; c++) {
        this.grid[r][c] = this.levelData.grid[r][c];
      }
    }
  },

  create: function() {
    var self = this;
    var GC = GAME_CONFIG;

    // Draw map
    this.mapGraphics = this.add.graphics();
    this.drawMap();

    // Tower layer
    this.towerGraphics = this.add.graphics();

    // Enemy layer (container)
    this.enemyContainer = this.add.container(0, 0);

    // Projectile layer
    this.projectileGraphics = this.add.graphics();

    // Range preview
    this.rangePreview = this.add.graphics();
    this.rangePreview.setDepth(5);

    // Hover preview
    this.hoverGraphics = this.add.graphics();
    this.hoverGraphics.setDepth(4);

    // UI Panel background
    this.add.rectangle(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT / 2,
      GC.UI_WIDTH, GC.TOTAL_HEIGHT, 0x16213e);
    this.add.rectangle(GC.GAME_WIDTH, GC.TOTAL_HEIGHT / 2, 2, GC.TOTAL_HEIGHT, 0x0f3460);

    // HUD top bar
    this.add.rectangle(GC.GAME_WIDTH / 2, 0, GC.GAME_WIDTH, 30, 0x000000).setOrigin(0.5, 0).setAlpha(0.5);
    this.levelText = this.add.text(10, 5, 'Level ' + (this.levelIndex + 1) + ': ' + this.levelData.name, {
      fontSize: '14px', fontFamily: 'Arial', color: '#ffffff'
    });
    this.waveText = this.add.text(300, 5, 'Wave: 0/' + this.levelData.waves.length, {
      fontSize: '14px', fontFamily: 'Arial', color: '#ffffff'
    });
    this.goldText = this.add.text(500, 5, 'Gold: ' + this.gold, {
      fontSize: '14px', fontFamily: 'Arial', color: '#FFD700'
    });
    this.livesText = this.add.text(650, 5, 'Lives: ' + this.lives, {
      fontSize: '14px', fontFamily: 'Arial', color: '#FF4444'
    });

    // Tower selection panel
    this.createTowerPanel();

    // Start wave button
    this.startWaveBtn = this.add.rectangle(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT - 120, 160, 40, 0xe94560)
      .setInteractive({ useHandCursor: true });
    this.startWaveText = this.add.text(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT - 120, 'START WAVE', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.startWaveBtn.on('pointerdown', function() { self.startNextWave(); });

    // Pause button
    var pauseBtn = this.add.rectangle(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT - 70, 70, 30, 0x333333)
      .setInteractive({ useHandCursor: true });
    this.pauseText = this.add.text(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT - 70, 'PAUSE', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff'
    }).setOrigin(0.5);
    pauseBtn.on('pointerdown', function() {
      self.paused = !self.paused;
      self.pauseText.setText(self.paused ? 'RESUME' : 'PAUSE');
      if (self.paused) {
        self.physics.pause();
        self.time.paused = true;
      } else {
        self.physics.resume();
        self.time.paused = false;
      }
    });

    // Speed button
    var speedBtn = this.add.rectangle(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT - 35, 70, 30, 0x333333)
      .setInteractive({ useHandCursor: true });
    this.speedText = this.add.text(GC.GAME_WIDTH + GC.UI_WIDTH / 2, GC.TOTAL_HEIGHT - 35, '1x', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff'
    }).setOrigin(0.5);
    speedBtn.on('pointerdown', function() {
      self.gameSpeed = self.gameSpeed === 1 ? 2 : 1;
      self.speedText.setText(self.gameSpeed + 'x');
      self.time.timeScale = self.gameSpeed;
      self.tweens.timeScale = self.gameSpeed;
    });

    // Back button
    var backBtn = this.add.rectangle(GC.GAME_WIDTH + GC.UI_WIDTH / 2 - 50, GC.TOTAL_HEIGHT - 70, 30, 30, 0x555555)
      .setInteractive({ useHandCursor: true });
    this.add.text(GC.GAME_WIDTH + GC.UI_WIDTH / 2 - 50, GC.TOTAL_HEIGHT - 70, '←', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffffff'
    }).setOrigin(0.5);
    backBtn.on('pointerdown', function() {
      self.cleanUp();
      self.scene.start('LevelSelectScene');
    });

    // Tower info panel (hidden by default)
    this.towerInfoContainer = this.add.container(GC.GAME_WIDTH + GC.UI_WIDTH / 2, 380);
    this.towerInfoContainer.setVisible(false);

    // Map click handler
    this.input.on('pointerdown', function(pointer) {
      if (pointer.x >= GC.GAME_WIDTH) return; // UI area
      if (self.gameOver) return;

      var col = Math.floor(pointer.x / GC.TILE_SIZE);
      var row = Math.floor(pointer.y / GC.TILE_SIZE);

      if (row < 0 || row >= GC.GRID_ROWS || col < 0 || col >= GC.GRID_COLS) return;

      // Check if clicking on existing tower
      var existingTower = self.getTowerAt(col, row);
      if (existingTower) {
        self.selectTower(existingTower);
        return;
      }

      // Place tower
      if (self.selectedTowerType && self.grid[row][col] === 0) {
        var towerDef = TOWER_DATA[self.selectedTowerType];
        var cost = towerDef.levels[0].cost;
        if (self.gold >= cost) {
          self.placeTower(col, row, self.selectedTowerType);
        }
      } else {
        self.deselectTower();
      }
    });

    // Mouse move for hover preview
    this.input.on('pointermove', function(pointer) {
      self.hoverGraphics.clear();
      self.rangePreview.clear();
      if (!self.selectedTowerType) return;
      if (pointer.x >= GC.GAME_WIDTH) return;

      var col = Math.floor(pointer.x / GC.TILE_SIZE);
      var row = Math.floor(pointer.y / GC.TILE_SIZE);
      if (row < 0 || row >= GC.GRID_ROWS || col < 0 || col >= GC.GRID_COLS) return;

      var canPlace = self.grid[row][col] === 0 && !self.getTowerAt(col, row);
      var tileX = col * GC.TILE_SIZE;
      var tileY = row * GC.TILE_SIZE;

      self.hoverGraphics.fillStyle(canPlace ? 0x00ff00 : 0xff0000, 0.3);
      self.hoverGraphics.fillRect(tileX, tileY, GC.TILE_SIZE, GC.TILE_SIZE);

      if (canPlace) {
        var towerDef = TOWER_DATA[self.selectedTowerType];
        var range = towerDef.levels[0].range;
        self.rangePreview.lineStyle(1, 0xffffff, 0.3);
        self.rangePreview.strokeCircle(tileX + GC.TILE_SIZE / 2, tileY + GC.TILE_SIZE / 2, range);
      }
    });

    // Right click to deselect
    this.input.on('pointerdown', function(pointer) {
      if (pointer.rightButtonDown()) {
        self.selectedTowerType = null;
        self.deselectTower();
        self.hoverGraphics.clear();
        self.rangePreview.clear();
        self.updateTowerPanelHighlight();
      }
    });
  },

  drawMap: function() {
    var GC = GAME_CONFIG;
    this.mapGraphics.clear();

    for (var r = 0; r < GC.GRID_ROWS; r++) {
      for (var c = 0; c < GC.GRID_COLS; c++) {
        var x = c * GC.TILE_SIZE;
        var y = r * GC.TILE_SIZE;
        var cell = this.levelData.grid[r][c];

        if (cell === 1) {
          // Path
          this.mapGraphics.fillStyle(0x8B7355, 1);
          this.mapGraphics.fillRect(x, y, GC.TILE_SIZE, GC.TILE_SIZE);
          this.mapGraphics.lineStyle(1, 0x6B5335, 0.5);
          this.mapGraphics.strokeRect(x, y, GC.TILE_SIZE, GC.TILE_SIZE);
        } else {
          // Grass
          this.mapGraphics.fillStyle(0x2d5a27, 1);
          this.mapGraphics.fillRect(x, y, GC.TILE_SIZE, GC.TILE_SIZE);
          this.mapGraphics.lineStyle(1, 0x1a3a17, 0.3);
          this.mapGraphics.strokeRect(x, y, GC.TILE_SIZE, GC.TILE_SIZE);
        }
      }
    }

    // Start/end markers
    var path = this.levelData.path;
    if (path.length > 0) {
      this.mapGraphics.fillStyle(0x00ff00, 0.5);
      this.mapGraphics.fillCircle(path[0].x, path[0].y, 12);
      this.mapGraphics.fillStyle(0xff0000, 0.5);
      this.mapGraphics.fillCircle(path[path.length - 1].x, path[path.length - 1].y, 12);
    }
  },

  createTowerPanel: function() {
    var GC = GAME_CONFIG;
    var self = this;
    var startY = 60;
    this.towerButtons = {};

    this.add.text(GC.GAME_WIDTH + GC.UI_WIDTH / 2, 40, 'TOWERS', {
      fontSize: '16px', fontFamily: 'Arial', color: '#e94560', fontStyle: 'bold'
    }).setOrigin(0.5);

    var types = ['arrow', 'slow', 'splash', 'sniper'];
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var towerDef = TOWER_DATA[type];
      var y = startY + i * 70;
      var x = GC.GAME_WIDTH + GC.UI_WIDTH / 2;

      var bg = this.add.rectangle(x, y + 20, 180, 60, 0x0f3460)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, 0x16213e);
      bg.towerType = type;

      // Tower icon
      var iconGfx = this.add.graphics();
      iconGfx.fillStyle(towerDef.color, 1);
      iconGfx.fillCircle(x - 65, y + 20, 15);
      iconGfx.lineStyle(2, 0xffffff, 0.5);
      iconGfx.strokeCircle(x - 65, y + 20, 15);

      this.add.text(x - 65, y + 20, towerDef.symbol, {
        fontSize: '14px', fontFamily: 'Arial', color: '#ffffff'
      }).setOrigin(0.5);

      this.add.text(x - 35, y + 10, towerDef.name, {
        fontSize: '12px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0, 0.5);

      this.add.text(x - 35, y + 28, towerDef.levels[0].cost + 'G | DMG:' + towerDef.levels[0].damage, {
        fontSize: '10px', fontFamily: 'Arial', color: '#aaaaaa'
      }).setOrigin(0, 0.5);

      this.towerButtons[type] = bg;

      bg.on('pointerdown', function() {
        self.deselectTower();
        self.selectedTowerType = this.towerType;
        self.updateTowerPanelHighlight();
      });

      bg.on('pointerover', function() {
        if (self.selectedTowerType !== this.towerType) {
          this.setFillStyle(0x1a2a50);
        }
      });
      bg.on('pointerout', function() {
        if (self.selectedTowerType !== this.towerType) {
          this.setFillStyle(0x0f3460);
        }
      });
    }
  },

  updateTowerPanelHighlight: function() {
    var types = ['arrow', 'slow', 'splash', 'sniper'];
    for (var i = 0; i < types.length; i++) {
      var btn = this.towerButtons[types[i]];
      if (types[i] === this.selectedTowerType) {
        btn.setFillStyle(0x2a4a80);
        btn.setStrokeStyle(2, 0xe94560);
      } else {
        btn.setFillStyle(0x0f3460);
        btn.setStrokeStyle(2, 0x16213e);
      }
    }
  },

  placeTower: function(col, row, type) {
    var GC = GAME_CONFIG;
    var towerDef = TOWER_DATA[type];
    var cost = towerDef.levels[0].cost;

    this.gold -= cost;
    this.grid[row][col] = 3; // 3 = tower placed

    var tower = {
      type: type,
      col: col,
      row: row,
      x: col * GC.TILE_SIZE + GC.TILE_SIZE / 2,
      y: row * GC.TILE_SIZE + GC.TILE_SIZE / 2,
      level: 0,
      totalInvested: cost,
      lastFired: 0,
      target: null
    };

    this.towers.push(tower);
    this.drawTowers();
    this.updateHUD();
  },

  getTowerAt: function(col, row) {
    for (var i = 0; i < this.towers.length; i++) {
      if (this.towers[i].col === col && this.towers[i].row === row) {
        return this.towers[i];
      }
    }
    return null;
  },

  selectTower: function(tower) {
    this.selectedTowerType = null;
    this.updateTowerPanelHighlight();
    this.selectedTower = tower;
    this.showTowerInfo(tower);

    // Show range
    this.rangePreview.clear();
    var towerDef = TOWER_DATA[tower.type];
    var stats = towerDef.levels[tower.level];
    this.rangePreview.lineStyle(2, 0xffffff, 0.4);
    this.rangePreview.strokeCircle(tower.x, tower.y, stats.range);
    this.rangePreview.fillStyle(0xffffff, 0.05);
    this.rangePreview.fillCircle(tower.x, tower.y, stats.range);
  },

  deselectTower: function() {
    this.selectedTower = null;
    this.towerInfoContainer.setVisible(false);
    this.rangePreview.clear();
  },

  showTowerInfo: function(tower) {
    var self = this;
    var towerDef = TOWER_DATA[tower.type];
    var stats = towerDef.levels[tower.level];

    // Clear previous info
    this.towerInfoContainer.removeAll(true);
    this.towerInfoContainer.setVisible(true);

    var bg = this.add.rectangle(0, 0, 180, 140, 0x0a0a2a).setStrokeStyle(2, 0xe94560);
    this.towerInfoContainer.add(bg);

    this.towerInfoContainer.add(this.add.text(0, -55, towerDef.name + ' (Lv.' + (tower.level + 1) + ')', {
      fontSize: '13px', fontFamily: 'Arial', color: '#e94560', fontStyle: 'bold'
    }).setOrigin(0.5));

    this.towerInfoContainer.add(this.add.text(-75, -35,
      'DMG: ' + stats.damage + '\nRange: ' + stats.range + '\nRate: ' + (stats.fireRate / 1000).toFixed(1) + 's', {
      fontSize: '11px', fontFamily: 'Arial', color: '#cccccc'
    }));

    // Upgrade button
    if (tower.level < 2) {
      var nextStats = towerDef.levels[tower.level + 1];
      var upgradeCost = nextStats.cost;
      var canAfford = self.gold >= upgradeCost;

      var upBtn = this.add.rectangle(0, 25, 160, 28, canAfford ? 0x228B22 : 0x555555)
        .setInteractive({ useHandCursor: canAfford });
      this.towerInfoContainer.add(upBtn);
      this.towerInfoContainer.add(this.add.text(0, 25, 'UPGRADE (' + upgradeCost + 'G)', {
        fontSize: '11px', fontFamily: 'Arial', color: canAfford ? '#ffffff' : '#888888', fontStyle: 'bold'
      }).setOrigin(0.5));

      if (canAfford) {
        upBtn.on('pointerdown', function() {
          self.upgradeTower(tower);
        });
      }
    }

    // Sell button
    var sellPrice = Math.floor(tower.totalInvested * TOWER_SELL_RATIO);
    var sellBtn = this.add.rectangle(0, 55, 160, 28, 0xCC4444)
      .setInteractive({ useHandCursor: true });
    this.towerInfoContainer.add(sellBtn);
    this.towerInfoContainer.add(this.add.text(0, 55, 'SELL (' + sellPrice + 'G)', {
      fontSize: '11px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5));

    sellBtn.on('pointerdown', function() {
      self.sellTower(tower);
    });
  },

  upgradeTower: function(tower) {
    var towerDef = TOWER_DATA[tower.type];
    var nextLevel = tower.level + 1;
    if (nextLevel > 2) return;
    var cost = towerDef.levels[nextLevel].cost;
    if (this.gold < cost) return;

    this.gold -= cost;
    tower.level = nextLevel;
    tower.totalInvested += cost;
    this.drawTowers();
    this.updateHUD();
    this.selectTower(tower); // Refresh info
  },

  sellTower: function(tower) {
    var sellPrice = Math.floor(tower.totalInvested * TOWER_SELL_RATIO);
    this.gold += sellPrice;
    this.grid[tower.row][tower.col] = 0;

    var idx = this.towers.indexOf(tower);
    if (idx !== -1) this.towers.splice(idx, 1);

    this.deselectTower();
    this.drawTowers();
    this.updateHUD();
  },

  drawTowers: function() {
    var GC = GAME_CONFIG;
    this.towerGraphics.clear();

    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      var def = TOWER_DATA[t.type];

      // Base
      this.towerGraphics.fillStyle(0x333333, 1);
      this.towerGraphics.fillRect(t.x - 16, t.y - 16, 32, 32);

      // Tower body
      this.towerGraphics.fillStyle(def.color, 1);
      this.towerGraphics.fillCircle(t.x, t.y, 12 + t.level * 2);

      // Level indicator
      for (var l = 0; l <= t.level; l++) {
        this.towerGraphics.fillStyle(0xFFD700, 1);
        this.towerGraphics.fillCircle(t.x - 8 + l * 8, t.y + 16, 3);
      }
    }
  },

  startNextWave: function() {
    if (this.waveActive || this.gameOver) return;
    if (this.currentWave >= this.levelData.waves.length) return;

    this.waveActive = true;
    this.currentWave++;
    this.updateHUD();

    var wave = this.levelData.waves[this.currentWave - 1];
    this.enemiesAlive = 0;
    this.totalEnemiesInWave = 0;
    this.enemiesSpawned = 0;

    for (var i = 0; i < wave.enemies.length; i++) {
      this.totalEnemiesInWave += wave.enemies[i].count;
    }

    this.startWaveBtn.setFillStyle(0x555555);
    this.startWaveText.setText('WAVE ' + this.currentWave);

    var self = this;
    for (var i = 0; i < wave.enemies.length; i++) {
      (function(enemyGroup) {
        var spawned = 0;
        var timer = self.time.addEvent({
          delay: enemyGroup.interval / self.gameSpeed,
          callback: function() {
            if (self.gameOver || self.paused) return;
            self.spawnEnemy(enemyGroup.type);
            spawned++;
            if (spawned >= enemyGroup.count) {
              timer.remove();
            }
          },
          repeat: enemyGroup.count - 1
        });
        self.spawnTimers.push(timer);
      })(wave.enemies[i]);
    }
  },

  spawnEnemy: function(type) {
    var enemyDef = ENEMY_DATA[type];
    var path = this.levelData.path;
    if (path.length === 0) return;

    var enemy = {
      type: type,
      hp: enemyDef.hp,
      maxHp: enemyDef.hp,
      speed: enemyDef.speed,
      reward: enemyDef.reward,
      color: enemyDef.color,
      radius: enemyDef.radius,
      x: path[0].x,
      y: path[0].y,
      pathIndex: 0,
      alive: true,
      slowFactor: 1,
      slowTimer: 0,
      graphics: this.add.graphics(),
      hpBar: this.add.graphics()
    };

    this.enemies.push(enemy);
    this.enemiesAlive++;
    this.enemiesSpawned++;
  },

  update: function(time, delta) {
    if (this.paused || this.gameOver) return;

    var adjustedDelta = delta;

    // Update enemies
    this.updateEnemies(adjustedDelta);

    // Update towers (fire at enemies)
    this.updateTowerFiring(time);

    // Update projectiles
    this.updateProjectiles(adjustedDelta);

    // Check wave completion
    if (this.waveActive && this.enemiesSpawned >= this.totalEnemiesInWave && this.enemiesAlive <= 0) {
      this.waveActive = false;
      if (this.currentWave >= this.levelData.waves.length) {
        this.winLevel();
      } else {
        this.startWaveBtn.setFillStyle(0xe94560);
        this.startWaveText.setText('NEXT WAVE');
      }
    }
  },

  updateEnemies: function(delta) {
    var path = this.levelData.path;
    var GC = GAME_CONFIG;

    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      if (!e.alive) continue;

      // Slow effect
      if (e.slowTimer > 0) {
        e.slowTimer -= delta;
        if (e.slowTimer <= 0) {
          e.slowFactor = 1;
        }
      }

      // Move along path
      if (e.pathIndex < path.length - 1) {
        var target = path[e.pathIndex + 1];
        var dx = target.x - e.x;
        var dy = target.y - e.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var moveSpeed = e.speed * e.slowFactor * (delta / 1000);

        if (dist <= moveSpeed) {
          e.x = target.x;
          e.y = target.y;
          e.pathIndex++;
        } else {
          e.x += (dx / dist) * moveSpeed;
          e.y += (dy / dist) * moveSpeed;
        }
      }

      // Reached end of path
      if (e.pathIndex >= path.length - 1) {
        this.lives--;
        this.removeEnemy(e, i);
        this.updateHUD();
        if (this.lives <= 0) {
          this.loseLevel();
          return;
        }
        continue;
      }

      // Draw enemy
      e.graphics.clear();
      e.hpBar.clear();

      // Body
      e.graphics.fillStyle(e.color, 1);
      e.graphics.fillCircle(e.x, e.y, e.radius);
      if (e.slowFactor < 1) {
        e.graphics.lineStyle(2, 0x00BFFF, 0.8);
        e.graphics.strokeCircle(e.x, e.y, e.radius + 2);
      }

      // HP bar
      var barWidth = e.radius * 2.5;
      var hpRatio = e.hp / e.maxHp;
      e.hpBar.fillStyle(0x333333, 1);
      e.hpBar.fillRect(e.x - barWidth / 2, e.y - e.radius - 8, barWidth, 4);
      var barColor = hpRatio > 0.5 ? 0x00ff00 : (hpRatio > 0.25 ? 0xffff00 : 0xff0000);
      e.hpBar.fillStyle(barColor, 1);
      e.hpBar.fillRect(e.x - barWidth / 2, e.y - e.radius - 8, barWidth * hpRatio, 4);
    }
  },

  updateTowerFiring: function(time) {
    for (var i = 0; i < this.towers.length; i++) {
      var tower = this.towers[i];
      var towerDef = TOWER_DATA[tower.type];
      var stats = towerDef.levels[tower.level];

      if (time - tower.lastFired < stats.fireRate) continue;

      // Find closest enemy in range
      var closestEnemy = null;
      var closestDist = Infinity;

      for (var j = 0; j < this.enemies.length; j++) {
        var e = this.enemies[j];
        if (!e.alive) continue;
        var dx = e.x - tower.x;
        var dy = e.y - tower.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= stats.range && dist < closestDist) {
          closestDist = dist;
          closestEnemy = e;
        }
      }

      if (closestEnemy) {
        tower.lastFired = time;
        this.fireProjectile(tower, closestEnemy, stats, towerDef);
      }
    }
  },

  fireProjectile: function(tower, target, stats, towerDef) {
    var proj = {
      x: tower.x,
      y: tower.y,
      targetX: target.x,
      targetY: target.y,
      target: target,
      speed: 400,
      damage: stats.damage,
      color: towerDef.color,
      type: tower.type,
      splashRadius: towerDef.splashRadius || 0,
      slowAmount: towerDef.slowAmount || 0,
      slowDuration: towerDef.slowDuration || 0,
      alive: true
    };
    this.projectiles.push(proj);
  },

  updateProjectiles: function(delta) {
    this.projectileGraphics.clear();

    for (var i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      if (!p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Update target position if target still alive
      if (p.target && p.target.alive) {
        p.targetX = p.target.x;
        p.targetY = p.target.y;
      }

      var dx = p.targetX - p.x;
      var dy = p.targetY - p.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var moveSpeed = p.speed * (delta / 1000);

      if (dist <= moveSpeed + 5) {
        // Hit!
        p.alive = false;
        this.onProjectileHit(p);
      } else {
        p.x += (dx / dist) * moveSpeed;
        p.y += (dy / dist) * moveSpeed;
      }

      // Draw projectile
      if (p.alive) {
        this.projectileGraphics.fillStyle(p.color, 1);
        this.projectileGraphics.fillCircle(p.x, p.y, 4);
      }
    }
  },

  onProjectileHit: function(proj) {
    if (proj.type === 'splash' && proj.splashRadius > 0) {
      // Splash damage
      for (var i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) continue;
        var dx = e.x - proj.targetX;
        var dy = e.y - proj.targetY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= proj.splashRadius) {
          this.damageEnemy(e, proj.damage);
        }
      }
      // Visual splash effect
      this.projectileGraphics.lineStyle(2, 0xFF4500, 0.5);
      this.projectileGraphics.strokeCircle(proj.targetX, proj.targetY, proj.splashRadius);
    } else {
      // Single target damage
      if (proj.target && proj.target.alive) {
        this.damageEnemy(proj.target, proj.damage);

        // Slow effect
        if (proj.slowAmount > 0) {
          proj.target.slowFactor = 1 - proj.slowAmount;
          proj.target.slowTimer = proj.slowDuration;
        }
      }
    }
  },

  damageEnemy: function(enemy, damage) {
    enemy.hp -= damage;
    if (enemy.hp <= 0) {
      this.gold += enemy.reward;
      enemy.alive = false;
      this.enemiesAlive--;

      // Remove graphics
      if (enemy.graphics) enemy.graphics.destroy();
      if (enemy.hpBar) enemy.hpBar.destroy();

      // Remove from array
      var idx = this.enemies.indexOf(enemy);
      if (idx !== -1) this.enemies.splice(idx, 1);

      this.updateHUD();
    }
  },

  removeEnemy: function(enemy, index) {
    enemy.alive = false;
    this.enemiesAlive--;
    if (enemy.graphics) enemy.graphics.destroy();
    if (enemy.hpBar) enemy.hpBar.destroy();
    this.enemies.splice(index, 1);
  },

  updateHUD: function() {
    this.goldText.setText('Gold: ' + this.gold);
    this.livesText.setText('Lives: ' + this.lives);
    this.waveText.setText('Wave: ' + this.currentWave + '/' + this.levelData.waves.length);
  },

  winLevel: function() {
    this.gameOver = true;
    GameState.unlockLevel(this.levelIndex + 2);
    this.scene.start('GameOverScene', {
      win: true,
      levelIndex: this.levelIndex,
      wavesCompleted: this.currentWave,
      totalWaves: this.levelData.waves.length
    });
  },

  loseLevel: function() {
    this.gameOver = true;
    this.scene.start('GameOverScene', {
      win: false,
      levelIndex: this.levelIndex,
      wavesCompleted: this.currentWave - 1,
      totalWaves: this.levelData.waves.length
    });
  },

  cleanUp: function() {
    for (var i = 0; i < this.spawnTimers.length; i++) {
      if (this.spawnTimers[i]) this.spawnTimers[i].remove();
    }
    this.spawnTimers = [];
    for (var i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].graphics) this.enemies[i].graphics.destroy();
      if (this.enemies[i].hpBar) this.enemies[i].hpBar.destroy();
    }
  }
});
