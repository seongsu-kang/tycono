(function() {
    'use strict';
    var S = window.Sentinel;

    // Synergy definitions
    var SYNERGIES = [
        {
            id: 'arrowRain',
            name: 'Arrow Rain',
            description: '3 Arrow Towers adjacent: +20% attack speed',
            icon: '>>',
            color: S.COLORS.TOWER_ARROW,
            check: function(towers, towerIndex) {
                var tower = towers[towerIndex];
                if (tower.type !== 'arrow') return null;
                var adjacentArrows = findAdjacentOfType(towers, tower, 'arrow', 2);
                if (adjacentArrows.length >= 2) {
                    return { towers: [towerIndex].concat(adjacentArrows.slice(0, 2)), buff: { spdBuff: 0.20 } };
                }
                return null;
            }
        },
        {
            id: 'artillerySupport',
            name: 'Artillery Support',
            description: 'Cannon + Slow adjacent: Cannon splash +30%, Slow effect +10%',
            icon: '*+',
            color: S.COLORS.TOWER_CANNON,
            check: function(towers, towerIndex) {
                var tower = towers[towerIndex];
                if (tower.type !== 'cannon' && tower.type !== 'slow') return null;

                if (tower.type === 'cannon') {
                    var adjacentSlow = findAdjacentOfType(towers, tower, 'slow', 2);
                    if (adjacentSlow.length >= 1) {
                        return { towers: [towerIndex, adjacentSlow[0]], buff: { splashBuff: 0.30, slowBuff: 0.10 } };
                    }
                } else {
                    var adjacentCannon = findAdjacentOfType(towers, tower, 'cannon', 2);
                    if (adjacentCannon.length >= 1) {
                        return { towers: [towerIndex, adjacentCannon[0]], buff: { splashBuff: 0.30, slowBuff: 0.10 } };
                    }
                }
                return null;
            }
        },
        {
            id: 'precisionStrike',
            name: 'Precision Strike',
            description: 'Sniper + Amplifier adjacent: Sniper crit +15%',
            icon: '!+',
            color: S.COLORS.TOWER_SNIPER,
            check: function(towers, towerIndex) {
                var tower = towers[towerIndex];
                if (tower.type !== 'sniper' && tower.type !== 'amplifier') return null;

                if (tower.type === 'sniper') {
                    var adj = findAdjacentOfType(towers, tower, 'amplifier', 2);
                    if (adj.length >= 1) {
                        return { towers: [towerIndex, adj[0]], buff: { critBonus: 0.15 } };
                    }
                } else {
                    var adj2 = findAdjacentOfType(towers, tower, 'sniper', 2);
                    if (adj2.length >= 1) {
                        return { towers: [towerIndex, adj2[0]], buff: { critBonus: 0.15 } };
                    }
                }
                return null;
            }
        },
        {
            id: 'electricStorm',
            name: 'Electric Storm',
            description: '2 Tesla Towers adjacent: chains shared',
            icon: 'zz',
            color: S.COLORS.TOWER_TESLA,
            check: function(towers, towerIndex) {
                var tower = towers[towerIndex];
                if (tower.type !== 'tesla') return null;
                var adj = findAdjacentOfType(towers, tower, 'tesla', 2);
                if (adj.length >= 1) {
                    return { towers: [towerIndex, adj[0]], buff: { chainShare: true } };
                }
                return null;
            }
        }
    ];

    function findAdjacentOfType(towers, sourceTower, targetType, maxDist) {
        var results = [];
        for (var i = 0; i < towers.length; i++) {
            var t = towers[i];
            if (t === sourceTower || t.type !== targetType) continue;
            var dist = S.Utils.gridDist(sourceTower.gridCol, sourceTower.gridRow, t.gridCol, t.gridRow);
            if (dist <= maxDist) {
                results.push(i);
            }
        }
        return results;
    }

    S.SynergySystem = {
        SYNERGIES: SYNERGIES,

        // Recalculate all active synergies
        calculate: function(towers) {
            var active = [];
            var towerSynergies = {}; // towerIndex -> [synergy buffs]

            // Reset all tower synergy buffs
            for (var t = 0; t < towers.length; t++) {
                towers[t].synergyBuffs = {};
                towers[t].activeSynergies = [];
            }

            // Check each synergy for each tower
            var checked = {};
            for (var s = 0; s < SYNERGIES.length; s++) {
                var synergy = SYNERGIES[s];
                for (var ti = 0; ti < towers.length; ti++) {
                    var result = synergy.check(towers, ti);
                    if (result) {
                        // Create unique key to avoid duplicate synergies
                        var key = synergy.id + ':' + result.towers.sort().join(',');
                        if (checked[key]) continue;
                        checked[key] = true;

                        active.push({
                            synergy: synergy,
                            towers: result.towers,
                            buff: result.buff
                        });

                        // Apply buffs to involved towers
                        for (var bi = 0; bi < result.towers.length; bi++) {
                            var idx = result.towers[bi];
                            if (!towers[idx].activeSynergies) towers[idx].activeSynergies = [];
                            towers[idx].activeSynergies.push(synergy.id);

                            // Merge buff into tower synergy buffs
                            var buffs = towers[idx].synergyBuffs || {};
                            for (var bk in result.buff) {
                                if (typeof result.buff[bk] === 'number') {
                                    buffs[bk] = (buffs[bk] || 0) + result.buff[bk];
                                } else {
                                    buffs[bk] = result.buff[bk];
                                }
                            }
                            towers[idx].synergyBuffs = buffs;
                        }
                    }
                }
            }

            return active;
        }
    };
})();
