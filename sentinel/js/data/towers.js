(function() {
    'use strict';
    var S = window.Sentinel;

    S.data.towers = {
        arrow: {
            name: 'Arrow Tower',
            category: 'basic',
            description: 'Fast attack, low damage. Early game staple.',
            color: S.COLORS.TOWER_ARROW,
            shape: 'triangle',
            targeting: 'closest',
            projectileType: 'arrow',
            tiers: [
                { damage: 8,  attackSpeed: 2.0, range: 3,   cost: 50,  cumCost: 50,  special: null },
                { damage: 14, attackSpeed: 2.3, range: 3.5, cost: 40,  cumCost: 90,  special: 'pierce2', pierce: 2 },
                { damage: 22, attackSpeed: 2.8, range: 4,   cost: 60,  cumCost: 150, special: 'pierce3', pierce: 3 },
                { damage: 35, attackSpeed: 3.5, range: 4.5, cost: 100, cumCost: 250, special: 'multishot', targets: 2 }
            ]
        },
        cannon: {
            name: 'Cannon Tower',
            category: 'basic',
            description: 'Slow attack, splash damage. Crowd control.',
            color: S.COLORS.TOWER_CANNON,
            shape: 'square',
            targeting: 'closest',
            projectileType: 'cannonball',
            tiers: [
                { damage: 25,  attackSpeed: 0.8, range: 3,   splash: 1.5, cost: 150, cumCost: 150, special: null },
                { damage: 40,  attackSpeed: 0.9, range: 3.5, splash: 1.8, cost: 120, cumCost: 270, special: null },
                { damage: 60,  attackSpeed: 1.0, range: 4,   splash: 2.0, cost: 180, cumCost: 450, special: 'knockback' },
                { damage: 90,  attackSpeed: 1.2, range: 4.5, splash: 2.5, cost: 250, cumCost: 700, special: 'cluster', clusterCount: 3 }
            ]
        },
        slow: {
            name: 'Slow Tower',
            category: 'support',
            description: 'Slows enemies. Pair with damage towers.',
            color: S.COLORS.TOWER_SLOW,
            shape: 'hexagon',
            targeting: 'closest',
            projectileType: 'ice',
            tiers: [
                { damage: 5,  attackSpeed: 1.5, range: 3,   slowFactor: 0.30, slowDuration: 2.0, cost: 100, cumCost: 100, special: null },
                { damage: 8,  attackSpeed: 1.5, range: 3.5, slowFactor: 0.40, slowDuration: 2.5, cost: 80,  cumCost: 180, special: null },
                { damage: 12, attackSpeed: 1.5, range: 4,   slowFactor: 0.50, slowDuration: 3.0, cost: 120, cumCost: 300, special: 'areaSlow', aoeRange: 2 },
                { damage: 18, attackSpeed: 1.5, range: 4.5, slowFactor: 0.60, slowDuration: 4.0, cost: 200, cumCost: 500, special: 'freeze', freezeInterval: 3, freezeDuration: 1.5 }
            ]
        },
        sniper: {
            name: 'Sniper Tower',
            category: 'specialist',
            description: 'Long range, high damage. Boss killer.',
            color: S.COLORS.TOWER_SNIPER,
            shape: 'diamond',
            targeting: 'strongest',
            projectileType: 'laser',
            tiers: [
                { damage: 50,  attackSpeed: 0.5, range: 6,    cost: 200, cumCost: 200, special: null, armorPen: 0 },
                { damage: 80,  attackSpeed: 0.6, range: 7,    cost: 160, cumCost: 360, special: 'armorPen', armorPen: 0.5 },
                { damage: 130, attackSpeed: 0.7, range: 8,    cost: 240, cumCost: 600, special: 'armorPen', armorPen: 1.0 },
                { damage: 200, attackSpeed: 0.8, range: 100,  cost: 350, cumCost: 950, special: 'critical', critChance: 0.20, critMult: 3.0, armorPen: 1.0 }
            ]
        },
        amplifier: {
            name: 'Amplifier Tower',
            category: 'support',
            description: 'Buffs nearby towers. No direct damage.',
            color: S.COLORS.TOWER_AMPLIFIER,
            shape: 'star',
            targeting: 'none',
            projectileType: 'none',
            tiers: [
                { damage: 0, attackSpeed: 0, range: 2,   atkBuff: 0.15, spdBuff: 0,    cost: 120, cumCost: 120, special: null },
                { damage: 0, attackSpeed: 0, range: 2.5, atkBuff: 0.25, spdBuff: 0.10, cost: 100, cumCost: 220, special: null },
                { damage: 0, attackSpeed: 0, range: 3,   atkBuff: 0.35, spdBuff: 0.20, cost: 150, cumCost: 370, special: null },
                { damage: 0, attackSpeed: 0, range: 3.5, atkBuff: 0.50, spdBuff: 0.30, cost: 250, cumCost: 620, special: 'overcharge', overchargeInterval: 10, overchargeDuration: 3 }
            ]
        },
        tesla: {
            name: 'Tesla Tower',
            category: 'specialist',
            description: 'Chain lightning. Excels vs groups.',
            color: S.COLORS.TOWER_TESLA,
            shape: 'bolt',
            targeting: 'closest',
            projectileType: 'lightning',
            tiers: [
                { damage: 15, attackSpeed: 1.0, range: 3,   chainCount: 2, chainDecay: 0.20, cost: 175, cumCost: 175, special: null },
                { damage: 25, attackSpeed: 1.2, range: 3.5, chainCount: 3, chainDecay: 0.15, cost: 130, cumCost: 305, special: null },
                { damage: 40, attackSpeed: 1.5, range: 4,   chainCount: 4, chainDecay: 0.10, cost: 200, cumCost: 505, special: null },
                { damage: 60, attackSpeed: 2.0, range: 4.5, chainCount: 5, chainDecay: 0.10, cost: 300, cumCost: 805, special: 'overload', stunDuration: 1.0, stunMinChain: 3 }
            ]
        },
        flame: {
            name: 'Flame Tower',
            category: 'advanced',
            description: 'Area fire damage. Burns enemies over time.',
            color: S.COLORS.TOWER_FLAME,
            shape: 'flame',
            targeting: 'area',
            projectileType: 'none',
            tiers: [
                { damage: 20, attackSpeed: 0, range: 2.5, coneAngle: 60,  cost: 200, cumCost: 200, special: null, dotDps: 0, dotDuration: 0 },
                { damage: 35, attackSpeed: 0, range: 3,   coneAngle: 75,  cost: 150, cumCost: 350, special: 'dot', dotDps: 5, dotDuration: 3 },
                { damage: 55, attackSpeed: 0, range: 3.5, coneAngle: 90,  cost: 220, cumCost: 570, special: 'dot', dotDps: 10, dotDuration: 3 },
                { damage: 80, attackSpeed: 0, range: 4,   coneAngle: 120, cost: 300, cumCost: 870, special: 'dragonFlame', dotDps: 15, dotDuration: 3, dotSpread: true }
            ]
        },
        void: {
            name: 'Void Tower',
            category: 'advanced',
            description: 'Warps space. Slows and extends enemy path.',
            color: S.COLORS.TOWER_VOID,
            shape: 'portal',
            targeting: 'fastest',
            projectileType: 'voidBolt',
            tiers: [
                { damage: 10, attackSpeed: 0.5, range: 3,   pathExtend: 1.0, extendDuration: 3, cost: 250, cumCost: 250, special: null, maxTargets: 1 },
                { damage: 18, attackSpeed: 0.5, range: 3.5, pathExtend: 1.5, extendDuration: 3, cost: 200, cumCost: 450, special: null, maxTargets: 1 },
                { damage: 30, attackSpeed: 0.5, range: 4,   pathExtend: 2.0, extendDuration: 4, cost: 280, cumCost: 730, special: 'multiTarget', maxTargets: 3 },
                { damage: 45, attackSpeed: 0.5, range: 4.5, pathExtend: 3.0, extendDuration: 5, cost: 400, cumCost: 1130, special: 'blackhole', bhCooldown: 8, bhDuration: 2, maxTargets: 3 }
            ]
        }
    };
})();
