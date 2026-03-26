// Sentinel - Tower Data
// 타워 4종 × 3레벨

(function() {
    'use strict';

    Sentinel.data.towers = {
        arrow: {
            name: "Arrow Tower",
            description: "빠른 공격 속도, 저렴",
            baseCost: 50,
            levels: [
                { damage: 8, range: 144, fireRate: 0.5, splash: 0, upgradeCost: 40 },  // Lv1 (2.0 atk/s)
                { damage: 12, range: 144, fireRate: 0.454, splash: 0, upgradeCost: 60 },  // Lv2 (2.2 atk/s)
                { damage: 18, range: 192, fireRate: 0.4, splash: 0, upgradeCost: 0 }    // Lv3 (2.5 atk/s)
            ],
            color: '#00ff99',
            projectileSpeed: 300,
            projectileColor: '#ccffee'
        },

        cannon: {
            name: "Cannon Tower",
            description: "범위 공격, 다수 처리",
            baseCost: 150,
            levels: [
                { damage: 25, range: 144, fireRate: 1.25, splash: 72, upgradeCost: 120 },  // Lv1 (0.8 atk/s)
                { damage: 40, range: 144, fireRate: 1.111, splash: 72, upgradeCost: 180 },  // Lv2 (0.9 atk/s)
                { damage: 60, range: 192, fireRate: 1.0, splash: 96, upgradeCost: 0 }    // Lv3 (1.0 atk/s)
            ],
            color: '#ff6600',
            projectileSpeed: 200,
            projectileColor: '#ffcc99'
        },

        slow: {
            name: "Slow Tower",
            description: "적 속도 감소, 지원형",
            baseCost: 100,
            levels: [
                { damage: 5, range: 144, fireRate: 0.667, splash: 0, slow: 0.5, slowDuration: 2, upgradeCost: 80 },  // Lv1 (1.5 atk/s)
                { damage: 8, range: 144, fireRate: 0.556, splash: 0, slow: 0.6, slowDuration: 2.5, upgradeCost: 120 },  // Lv2 (1.8 atk/s)
                { damage: 12, range: 192, fireRate: 0.5, splash: 0, slow: 0.7, slowDuration: 3, upgradeCost: 0 }    // Lv3 (2.0 atk/s)
            ],
            color: '#00aaff',
            projectileSpeed: 350,
            projectileColor: '#99ddff'
        },

        sniper: {
            name: "Sniper Tower",
            description: "긴 사거리, 높은 대미지",
            baseCost: 200,
            levels: [
                { damage: 50, range: 240, fireRate: 1.667, splash: 0, upgradeCost: 160, instant: true },  // Lv1 (0.6 atk/s)
                { damage: 80, range: 288, fireRate: 1.429, splash: 0, upgradeCost: 240, instant: true },  // Lv2 (0.7 atk/s)
                { damage: 120, range: 336, fireRate: 1.25, splash: 0, upgradeCost: 0, instant: true }    // Lv3 (0.8 atk/s)
            ],
            color: '#ff00aa',
            projectileSpeed: 9999,  // instant (레이저)
            projectileColor: '#ffccee'
        }
    };

    console.log('[Sentinel] Tower data loaded');
})();
