var GameOverScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function GameOverScene() {
    Phaser.Scene.call(this, { key: 'GameOverScene' });
  },

  init: function(data) {
    this.win = data.win;
    this.levelIndex = data.levelIndex;
    this.wavesCompleted = data.wavesCompleted;
    this.totalWaves = data.totalWaves;
  },

  create: function() {
    var W = GAME_CONFIG.TOTAL_WIDTH;
    var H = GAME_CONFIG.TOTAL_HEIGHT;
    var self = this;

    this.cameras.main.setBackgroundColor(this.win ? '#1a2e1a' : '#2e1a1a');

    // Title
    this.add.text(W / 2, H / 4, this.win ? 'VICTORY!' : 'DEFEATED', {
      fontSize: '56px', fontFamily: 'Arial',
      color: this.win ? '#00ff00' : '#ff4444', fontStyle: 'bold'
    }).setOrigin(0.5);

    var levelName = LEVEL_DATA[this.levelIndex].name;
    this.add.text(W / 2, H / 4 + 60, 'Level ' + (this.levelIndex + 1) + ': ' + levelName, {
      fontSize: '20px', fontFamily: 'Arial', color: '#aaaaaa'
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 4 + 90, 'Waves completed: ' + this.wavesCompleted + '/' + this.totalWaves, {
      fontSize: '16px', fontFamily: 'Arial', color: '#888888'
    }).setOrigin(0.5);

    // Retry button
    var retryBtn = this.add.rectangle(W / 2 - 100, H / 2 + 60, 160, 50, 0xe94560)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2 - 100, H / 2 + 60, 'RETRY', {
      fontSize: '20px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    retryBtn.on('pointerdown', function() {
      self.scene.start('GameScene', { levelIndex: self.levelIndex });
    });

    // Level select button
    var selectBtn = this.add.rectangle(W / 2 + 100, H / 2 + 60, 160, 50, 0x0f3460)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2 + 100, H / 2 + 60, 'LEVELS', {
      fontSize: '20px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    selectBtn.on('pointerdown', function() {
      self.scene.start('LevelSelectScene');
    });

    // Next level button (only on win and not last level)
    if (this.win && this.levelIndex < LEVEL_DATA.length - 1) {
      var nextBtn = this.add.rectangle(W / 2, H / 2 + 130, 160, 50, 0x228B22)
        .setInteractive({ useHandCursor: true });
      this.add.text(W / 2, H / 2 + 130, 'NEXT LEVEL →', {
        fontSize: '20px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);
      nextBtn.on('pointerdown', function() {
        self.scene.start('GameScene', { levelIndex: self.levelIndex + 1 });
      });
    }
  }
});
