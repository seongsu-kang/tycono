// Sentinel - Tower Data
// 타워 4종 × 3레벨

(function() {
    'use strict';

    Sentinel.data.towers = {
        arrow: {
            name: "Arrow Tower",
            description: "기본 원거리 타워",
            baseCost: 50,
            levels: [
                { damage: 10, range: 120, fireRate: 0.8, splash: 0, upgradeCost: 30 },  // Lv1
                { damage: 18, range: 140, fireRate: 0.6, splash: 0, upgradeCost: 60 },  // Lv2
                { damage: 30, range: 160, fireRate: 0.4, splash: 0, upgradeCost: 0 }    // Lv3 (max)
            ],
            color: '#4CAF50',
            projectileSpeed: 300,
            projectileColor: '#8BC34A'
        },

        cannon: {
            name: "Cannon Tower",
            description: "강력한 범위 공격",
            baseCost: 150,
            levels: [
                { damage: 25, range: 100, fireRate: 1.5, splash: 40, upgradeCost: 100 },
                { damage: 45, range: 120, fireRate: 1.2, splash: 50, upgradeCost: 150 },
                { damage: 80, range: 140, fireRate: 1.0, splash: 60, upgradeCost: 0 }
            ],
            color: '#FF5722',
            projectileSpeed: 200,
            projectileColor: '#FF9800'
        },

        slow: {
            name: "Slow Tower",
            description: "적 속도 감소",
            baseCost: 100,
            levels: [
                { damage: 5, range: 110, fireRate: 1.0, splash: 0, slow: 0.5, slowDuration: 2, upgradeCost: 70 },
                { damage: 8, range: 130, fireRate: 0.8, splash: 0, slow: 0.4, slowDuration: 3, upgradeCost: 100 },
                { damage: 12, range: 150, fireRate: 0.6, splash: 0, slow: 0.3, slowDuration: 4, upgradeCost: 0 }
            ],
            color: '#2196F3',
            projectileSpeed: 350,
            projectileColor: '#64B5F6'
        },

        sniper: {
            name: "Sniper Tower",
            description: "극도로 긴 사거리와 높은 대미지",
            baseCost: 200,
            levels: [
                { damage: 50, range: 200, fireRate: 2.0, splash: 0, upgradeCost: 150 },
                { damage: 90, range: 240, fireRate: 1.7, splash: 0, upgradeCost: 200 },
                { damage: 150, range: 280, fireRate: 1.4, splash: 0, upgradeCost: 0 }
            ],
            color: '#9C27B0',
            projectileSpeed: 500,
            projectileColor: '#BA68C8'
        }
    };

    console.log('[Sentinel] Tower data loaded');
})();
