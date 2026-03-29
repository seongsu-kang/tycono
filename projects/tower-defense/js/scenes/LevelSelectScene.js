var LevelSelectScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function LevelSelectScene() {
    Phaser.Scene.call(this, { key: 'LevelSelectScene' });
  },
  create: function() {
    var W = GAME_CONFIG.TOTAL_WIDTH;
    var H = GAME_CONFIG.TOTAL_HEIGHT;
    var self = this;

    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.add.text(W / 2, 50, 'SELECT LEVEL', {
      fontSize: '36px', fontFamily: 'Arial', color: '#e94560', fontStyle: 'bold'
    }).setOrigin(0.5);

    var startX = W / 2 - 2 * 120;
    for (var i = 0; i < LEVEL_DATA.length; i++) {
      var level = LEVEL_DATA[i];
      var x = startX + i * 120;
      var y = H / 2 - 40;
      var unlocked = (i + 1) <= GameState.unlockedLevel;

      var color = unlocked ? 0x0f3460 : 0x333333;
      var card = this.add.rectangle(x, y, 100, 140, color).setStrokeStyle(2, unlocked ? 0xe94560 : 0x555555);

      this.add.text(x, y - 40, String(i + 1), {
        fontSize: '36px', fontFamily: 'Arial', color: unlocked ? '#e94560' : '#666666', fontStyle: 'bold'
      }).setOrigin(0.5);

      this.add.text(x, y + 10, level.name, {
        fontSize: '12px', fontFamily: 'Arial', color: unlocked ? '#ffffff' : '#666666'
      }).setOrigin(0.5);

      this.add.text(x, y + 30, 'Waves: ' + level.waves.length, {
        fontSize: '10px', fontFamily: 'Arial', color: unlocked ? '#aaaaaa' : '#555555'
      }).setOrigin(0.5);

      if (!unlocked) {
        this.add.text(x, y + 50, '🔒', { fontSize: '20px' }).setOrigin(0.5);
      }

      if (unlocked) {
        card.setInteractive({ useHandCursor: true });
        card.levelIndex = i;
        card.on('pointerover', function() { this.setFillStyle(0x16213e); });
        card.on('pointerout', function() { this.setFillStyle(0x0f3460); });
        card.on('pointerdown', function() {
          self.scene.start('GameScene', { levelIndex: this.levelIndex });
        });
      }
    }

    // Level descriptions
    var descY = H / 2 + 60;
    for (var i = 0; i < LEVEL_DATA.length; i++) {
      var x = startX + i * 120;
      this.add.text(x, descY + 20, LEVEL_DATA[i].description, {
        fontSize: '9px', fontFamily: 'Arial', color: '#888888',
        wordWrap: { width: 95 }, align: 'center'
      }).setOrigin(0.5, 0);
    }

    // Back button
    var backBtn = this.add.rectangle(80, H - 40, 120, 40, 0x333333)
      .setInteractive({ useHandCursor: true });
    this.add.text(80, H - 40, '← MENU', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ffffff'
    }).setOrigin(0.5);
    backBtn.on('pointerdown', function() { self.scene.start('MenuScene'); });
  }
});
