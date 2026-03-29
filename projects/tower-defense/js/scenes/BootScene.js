// BootScene - minimal boot, no assets to load (all procedural)
var BootScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function BootScene() {
    Phaser.Scene.call(this, { key: 'BootScene' });
  },
  create: function() {
    this.scene.start('MenuScene');
  }
});
