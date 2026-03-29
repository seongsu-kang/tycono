var MenuScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function MenuScene() {
    Phaser.Scene.call(this, { key: 'MenuScene' });
  },
  create: function() {
    var W = GAME_CONFIG.TOTAL_WIDTH;
    var H = GAME_CONFIG.TOTAL_HEIGHT;

    // Background
    this.cameras.main.setBackgroundColor('#1a1a2e');

    // Title
    this.add.text(W / 2, H / 4, 'SENTINEL', {
      fontSize: '64px', fontFamily: 'Arial', color: '#e94560',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 4 + 60, 'Tower Defense', {
      fontSize: '24px', fontFamily: 'Arial', color: '#16213e'
    }).setOrigin(0.5).setColor('#0f3460');

    // Play button
    var playBtn = this.add.rectangle(W / 2, H / 2 + 40, 200, 60, 0xe94560)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H / 2 + 40, 'PLAY', {
      fontSize: '28px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    playBtn.on('pointerover', function() { playBtn.setFillStyle(0xff6b6b); });
    playBtn.on('pointerout', function() { playBtn.setFillStyle(0xe94560); });
    playBtn.on('pointerdown', function() {
      this.scene.start('LevelSelectScene');
    }, this);

    // Instructions
    this.add.text(W / 2, H - 80, 'Place towers to defend against waves of enemies!', {
      fontSize: '14px', fontFamily: 'Arial', color: '#a0a0a0'
    }).setOrigin(0.5);
  }
});
