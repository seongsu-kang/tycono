(function() {
    'use strict';
    var S = window.Sentinel;

    function GoldPopup(x, y, amount) {
        this.x = x;
        this.y = y;
        this.startY = y;
        this.amount = amount;
        this.life = 0;
        this.duration = 0.8;
        this.dead = false;
    }

    GoldPopup.prototype.update = function(dt) {
        this.life += dt;
        if (this.life >= this.duration) this.dead = true;
    };

    GoldPopup.prototype.render = function(ctx) {
        if (this.dead) return;
        var progress = this.life / this.duration;
        var alpha = 1 - progress;
        var offsetY = progress * 30;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = S.COLORS.GOLD_YELLOW;
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = S.COLORS.GOLD_YELLOW;
        ctx.shadowBlur = 6;
        ctx.fillText('+' + this.amount + 'G', this.x, this.startY - offsetY);
        ctx.restore();
    };

    function WaveCompletePopup(wave, bonus, interest) {
        this.wave = wave;
        this.bonus = bonus;
        this.interest = interest;
        this.life = 0;
        this.duration = 2.5;
        this.dead = false;
    }

    WaveCompletePopup.prototype.update = function(dt) {
        this.life += dt;
        if (this.life >= this.duration) this.dead = true;
    };

    WaveCompletePopup.prototype.render = function(ctx) {
        if (this.dead) return;
        var progress = this.life / this.duration;
        var alpha = progress < 0.1 ? progress / 0.1 :
                    progress > 0.7 ? (1 - progress) / 0.3 : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        var cx = S.GAME_BOARD_X + S.GAME_BOARD_WIDTH / 2;
        var cy = S.GAME_BOARD_Y + S.GAME_BOARD_HEIGHT / 2 - 30;

        ctx.fillStyle = S.COLORS.ELECTRIC_GREEN;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = S.COLORS.ELECTRIC_GREEN;
        ctx.shadowBlur = 12;
        ctx.fillText('Wave ' + this.wave + ' Complete!', cx, cy);

        ctx.shadowBlur = 0;
        ctx.fillStyle = S.COLORS.GOLD_YELLOW;
        ctx.font = 'bold 16px Arial';
        var bonusText = '+' + this.bonus + 'G bonus';
        if (this.interest > 0) bonusText += ' | +' + this.interest + 'G interest';
        ctx.fillText(bonusText, cx, cy + 30);

        ctx.restore();
    };

    function BossWarning(message) {
        this.message = message;
        this.life = 0;
        this.duration = 3;
        this.dead = false;
    }

    BossWarning.prototype.update = function(dt) {
        this.life += dt;
        if (this.life >= this.duration) this.dead = true;
    };

    BossWarning.prototype.render = function(ctx) {
        if (this.dead) return;
        var progress = this.life / this.duration;

        // Flashing red screen edge
        var flash = Math.sin(this.life * 8) > 0;
        if (flash) {
            ctx.save();
            ctx.globalAlpha = 0.15 * (1 - progress);
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(S.GAME_BOARD_X, S.GAME_BOARD_Y, S.GAME_BOARD_WIDTH, S.GAME_BOARD_HEIGHT);
            ctx.restore();
        }

        // Warning text
        var alpha = progress < 0.1 ? progress / 0.1 :
                    progress > 0.8 ? (1 - progress) / 0.2 : 1;
        var shake = Math.sin(this.life * 20) * 3;

        ctx.save();
        ctx.globalAlpha = alpha;
        var cx = S.GAME_BOARD_X + S.GAME_BOARD_WIDTH / 2;
        var cy = S.GAME_BOARD_Y + S.GAME_BOARD_HEIGHT / 2;

        ctx.fillStyle = '#ff2222';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20;
        ctx.fillText(this.message, cx + shake, cy);
        ctx.restore();
    };

    function ScreenFlash(color, duration) {
        this.color = color;
        this.life = 0;
        this.duration = duration || 0.2;
        this.dead = false;
    }

    ScreenFlash.prototype.update = function(dt) {
        this.life += dt;
        if (this.life >= this.duration) this.dead = true;
    };

    ScreenFlash.prototype.render = function(ctx) {
        if (this.dead) return;
        var alpha = 0.3 * (1 - this.life / this.duration);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(S.GAME_BOARD_X, S.GAME_BOARD_Y, S.GAME_BOARD_WIDTH, S.GAME_BOARD_HEIGHT);
        ctx.restore();
    };

    // Effects manager
    S.Effects = {
        items: [],

        add: function(effect) {
            this.items.push(effect);
        },

        update: function(dt) {
            for (var i = this.items.length - 1; i >= 0; i--) {
                this.items[i].update(dt);
                if (this.items[i].dead) this.items.splice(i, 1);
            }
        },

        render: function(ctx) {
            for (var i = 0; i < this.items.length; i++) {
                this.items[i].render(ctx);
            }
        },

        clear: function() {
            this.items = [];
        }
    };

    S.GoldPopup = GoldPopup;
    S.WaveCompletePopup = WaveCompletePopup;
    S.BossWarning = BossWarning;
    S.ScreenFlash = ScreenFlash;
})();
