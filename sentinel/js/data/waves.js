(function() {
    'use strict';
    var S = window.Sentinel;

    // Wave spawn patterns for Map 1 (Verdant Path), Normal difficulty
    // Other maps reuse same waves with slight modifications
    // Format: { time: seconds from wave start, type: enemyType, count: number, interval: seconds }

    var map1Waves = [
        // Wave 1: Tutorial (Scout only)
        {
            spawns: [
                { time: 3, type: 'scout', count: 5, interval: 1 },
                { time: 9, type: 'scout', count: 5, interval: 1 }
            ],
            bonus: 40
        },
        // Wave 2: Soldier intro
        {
            spawns: [
                { time: 3, type: 'scout', count: 3, interval: 1 },
                { time: 7, type: 'soldier', count: 2, interval: 1.5 },
                { time: 11, type: 'scout', count: 2, interval: 1 },
                { time: 14, type: 'soldier', count: 2, interval: 1.5 }
            ],
            bonus: 50
        },
        // Wave 3: Runner intro
        {
            spawns: [
                { time: 3, type: 'scout', count: 4, interval: 1 },
                { time: 8, type: 'soldier', count: 2, interval: 1.5 },
                { time: 12, type: 'runner', count: 3, interval: 0.7 },
                { time: 15, type: 'soldier', count: 1, interval: 0 }
            ],
            bonus: 60
        },
        // Wave 4: Swarmer intro (modified from original)
        {
            spawns: [
                { time: 3, type: 'soldier', count: 2, interval: 1.5 },
                { time: 7, type: 'runner', count: 3, interval: 0.7 },
                { time: 10, type: 'swarmer', count: 10, interval: 0.4 },
                { time: 16, type: 'soldier', count: 2, interval: 1.5 }
            ],
            bonus: 70
        },
        // Wave 5: Tank intro
        {
            spawns: [
                { time: 3, type: 'runner', count: 3, interval: 0.7 },
                { time: 6, type: 'soldier', count: 2, interval: 1.5 },
                { time: 10, type: 'tank', count: 1, interval: 0 },
                { time: 14, type: 'soldier', count: 2, interval: 1.5 }
            ],
            bonus: 80
        },
        // Wave 6: Healer intro
        {
            spawns: [
                { time: 3, type: 'scout', count: 3, interval: 1 },
                { time: 7, type: 'runner', count: 3, interval: 0.7 },
                { time: 10, type: 'healer', count: 1, interval: 0 },
                { time: 12, type: 'soldier', count: 3, interval: 1.5 },
                { time: 17, type: 'scout', count: 3, interval: 1 },
                { time: 21, type: 'healer', count: 1, interval: 0 }
            ],
            bonus: 90
        },
        // Wave 7: Complex (Berserker intro)
        {
            spawns: [
                { time: 3, type: 'soldier', count: 3, interval: 1.5 },
                { time: 8, type: 'tank', count: 1, interval: 0 },
                { time: 10, type: 'runner', count: 3, interval: 0.7 },
                { time: 14, type: 'healer', count: 1, interval: 0 },
                { time: 16, type: 'berserker', count: 2, interval: 1.5 },
                { time: 20, type: 'soldier', count: 2, interval: 1.5 },
                { time: 24, type: 'tank', count: 1, interval: 0 }
            ],
            bonus: 100
        },
        // Wave 8: Mass wave (Swarmer return)
        {
            spawns: [
                { time: 3, type: 'scout', count: 4, interval: 0.8 },
                { time: 7, type: 'runner', count: 3, interval: 0.7 },
                { time: 10, type: 'swarmer', count: 12, interval: 0.3 },
                { time: 15, type: 'soldier', count: 3, interval: 1 },
                { time: 19, type: 'scout', count: 4, interval: 0.8 },
                { time: 23, type: 'runner', count: 2, interval: 0.7 }
            ],
            bonus: 110
        },
        // Wave 9: Shield Bearer intro
        {
            spawns: [
                { time: 3, type: 'soldier', count: 3, interval: 1.5 },
                { time: 8, type: 'runner', count: 3, interval: 0.7 },
                { time: 11, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 13, type: 'tank', count: 1, interval: 0 },
                { time: 16, type: 'healer', count: 1, interval: 0 },
                { time: 18, type: 'soldier', count: 2, interval: 1.5 },
                { time: 22, type: 'tank', count: 1, interval: 0 }
            ],
            bonus: 120
        },
        // Wave 10: MINOR BOSS
        {
            spawns: [
                { time: 3, type: 'scout', count: 4, interval: 0.8 },
                { time: 7, type: 'soldier', count: 3, interval: 1 },
                { time: 11, type: 'runner', count: 4, interval: 0.7 },
                { time: 15, type: 'tank', count: 2, interval: 2 },
                { time: 20, type: 'scout', count: 4, interval: 0.8 },
                { time: 24, type: 'soldier', count: 2, interval: 1 },
                { time: 30, type: 'minorBoss', count: 1, interval: 0 }
            ],
            bonus: 130,
            bossWarning: { time: 27, message: 'MINI BOSS INCOMING!' }
        },
        // Wave 11: Speed + Shield combo (Splitter intro)
        {
            spawns: [
                { time: 3, type: 'runner', count: 4, interval: 0.7 },
                { time: 7, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 9, type: 'soldier', count: 2, interval: 1.5 },
                { time: 13, type: 'splitter', count: 3, interval: 1 },
                { time: 17, type: 'runner', count: 4, interval: 0.7 },
                { time: 21, type: 'healer', count: 1, interval: 0 },
                { time: 23, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 25, type: 'soldier', count: 2, interval: 1.5 }
            ],
            bonus: 140
        },
        // Wave 12: Heavy armor
        {
            spawns: [
                { time: 3, type: 'soldier', count: 4, interval: 1.5 },
                { time: 9, type: 'tank', count: 1, interval: 0 },
                { time: 12, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 14, type: 'healer', count: 1, interval: 0 },
                { time: 16, type: 'soldier', count: 4, interval: 1.5 },
                { time: 22, type: 'tank', count: 1, interval: 0 },
                { time: 25, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 27, type: 'healer', count: 1, interval: 0 },
                { time: 30, type: 'tank', count: 1, interval: 0 }
            ],
            bonus: 150
        },
        // Wave 13: Mass swarming (Swarmer + Berserker)
        {
            spawns: [
                { time: 3, type: 'scout', count: 5, interval: 0.7 },
                { time: 7, type: 'runner', count: 3, interval: 0.5 },
                { time: 10, type: 'swarmer', count: 15, interval: 0.3 },
                { time: 16, type: 'soldier', count: 3, interval: 1 },
                { time: 20, type: 'berserker', count: 2, interval: 1.5 },
                { time: 24, type: 'scout', count: 5, interval: 0.7 },
                { time: 28, type: 'runner', count: 3, interval: 0.5 }
            ],
            bonus: 160
        },
        // Wave 14: Elite composition (Splitter + Berserker)
        {
            spawns: [
                { time: 3, type: 'soldier', count: 3, interval: 1.5 },
                { time: 7, type: 'runner', count: 3, interval: 0.7 },
                { time: 11, type: 'tank', count: 2, interval: 2 },
                { time: 16, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 18, type: 'healer', count: 2, interval: 2 },
                { time: 22, type: 'splitter', count: 4, interval: 1 },
                { time: 27, type: 'berserker', count: 1, interval: 0 },
                { time: 29, type: 'tank', count: 1, interval: 0 },
                { time: 31, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 33, type: 'soldier', count: 2, interval: 1.5 }
            ],
            bonus: 170
        },
        // Wave 15: FINAL BOSS
        {
            spawns: [
                { time: 3, type: 'scout', count: 5, interval: 0.8 },
                { time: 7, type: 'soldier', count: 4, interval: 1 },
                { time: 12, type: 'runner', count: 5, interval: 0.7 },
                { time: 16, type: 'tank', count: 1, interval: 0 },
                { time: 18, type: 'shieldBearer', count: 1, interval: 0 },
                { time: 20, type: 'scout', count: 5, interval: 0.8 },
                { time: 24, type: 'soldier', count: 4, interval: 1 },
                { time: 29, type: 'tank', count: 1, interval: 0 },
                { time: 35, type: 'finalBoss', count: 1, interval: 0 }
            ],
            bonus: 180,
            bossWarning: { time: 32, message: 'FINAL BOSS INCOMING!' }
        }
    ];

    S.data.waves = {
        verdantPath: map1Waves,
        frozenCrossing: map1Waves, // Same waves, different map layout
        desertSiege: map1Waves     // Same waves, different map layout
    };
})();
