(function() {
    'use strict';
    var S = window.Sentinel;

    // Save/Load system using localStorage
    S.SaveSystem = {
        SAVE_KEY: 'sentinel_save_v1',

        load: function() {
            try {
                var raw = localStorage.getItem(this.SAVE_KEY);
                if (!raw) return this.getDefault();
                return JSON.parse(raw);
            } catch (e) {
                return this.getDefault();
            }
        },

        save: function(data) {
            try {
                localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
            } catch (e) {
                // localStorage might be full or unavailable
            }
        },

        getDefault: function() {
            return {
                unlockedMaps: ['verdantPath'],
                mapStars: {},
                bestTimes: {},
                totalGamesPlayed: 0,
                totalVictories: 0,
                settings: {
                    muted: false
                }
            };
        },

        unlockMap: function(mapId) {
            var data = this.load();
            if (data.unlockedMaps.indexOf(mapId) === -1) {
                data.unlockedMaps.push(mapId);
            }
            this.save(data);
            return data;
        },

        setMapStars: function(mapId, difficulty, stars) {
            var data = this.load();
            var key = mapId + '_' + difficulty;
            var existing = data.mapStars[key] || 0;
            if (stars > existing) {
                data.mapStars[key] = stars;
            }
            this.save(data);
            return data;
        },

        getMapStars: function(mapId, difficulty) {
            var data = this.load();
            var key = mapId + '_' + difficulty;
            return data.mapStars[key] || 0;
        },

        getBestStars: function(mapId) {
            var data = this.load();
            var best = 0;
            var diffs = ['easy', 'normal', 'hard'];
            for (var i = 0; i < diffs.length; i++) {
                var key = mapId + '_' + diffs[i];
                var s = data.mapStars[key] || 0;
                if (s > best) best = s;
            }
            return best;
        },

        isMapUnlocked: function(mapId) {
            var data = this.load();
            return data.unlockedMaps.indexOf(mapId) !== -1;
        },

        recordGame: function(won) {
            var data = this.load();
            data.totalGamesPlayed++;
            if (won) data.totalVictories++;
            this.save(data);
        },

        setMuted: function(muted) {
            var data = this.load();
            data.settings.muted = muted;
            this.save(data);
        },

        isMuted: function() {
            var data = this.load();
            return data.settings.muted || false;
        }
    };
})();
