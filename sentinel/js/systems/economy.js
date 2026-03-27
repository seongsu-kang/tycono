(function() {
    'use strict';
    var S = window.Sentinel;

    S.Economy = {
        // Calculate sell price for a tower
        getSellPrice: function(tower) {
            return Math.floor(tower.totalInvested * 0.75);
        },

        // Calculate upgrade cost for next tier
        getUpgradeCost: function(towerType, currentTier) {
            var towerData = S.data.towers[towerType];
            if (currentTier >= towerData.tiers.length - 1) return null; // Max tier
            return towerData.tiers[currentTier + 1].cost;
        },

        // Calculate wave bonus gold
        getWaveBonus: function(waveNumber) {
            return waveNumber * 10 + 30;
        },

        // Calculate interest on gold
        getInterest: function(gold, difficulty) {
            var rate = S.DIFFICULTY[difficulty].interest;
            return Math.min(50, Math.floor(gold * rate));
        },

        // Calculate enemy reward with difficulty modifier
        getEnemyReward: function(enemyType, difficulty) {
            var base = S.data.enemies[enemyType].reward;
            var mult = S.DIFFICULTY[difficulty].rewardMult;
            return Math.round(base * mult);
        },

        // Calculate tower placement cost
        getTowerCost: function(towerType) {
            return S.data.towers[towerType].tiers[0].cost;
        }
    };
})();
