// Sentinel - Wave Data
// 10웨이브 점진적 난이도

(function() {
    'use strict';

    Sentinel.data.waves = [
        // Wave 1: 튜토리얼 웨이브
        {
            enemies: [
                { type: 'scout', count: 10, interval: 1.0 }
            ],
            bonus: 30
        },

        // Wave 2: Soldier 첫 등장
        {
            enemies: [
                { type: 'scout', count: 8, interval: 1.0 },
                { type: 'soldier', count: 3, interval: 1.5 }
            ],
            bonus: 40
        },

        // Wave 3: 혼합 구성
        {
            enemies: [
                { type: 'scout', count: 5, interval: 1.0 },
                { type: 'soldier', count: 6, interval: 1.2 }
            ],
            bonus: 50
        },

        // Wave 4: Tank 첫 등장
        {
            enemies: [
                { type: 'soldier', count: 8, interval: 1.0 },
                { type: 'tank', count: 1, interval: 2.5 }
            ],
            bonus: 60
        },

        // Wave 5: Healer 첫 등장
        {
            enemies: [
                { type: 'scout', count: 10, interval: 0.8 },
                { type: 'healer', count: 2, interval: 3.0 }
            ],
            bonus: 70
        },

        // Wave 6: 복합 구성
        {
            enemies: [
                { type: 'soldier', count: 6, interval: 1.0 },
                { type: 'tank', count: 2, interval: 2.0 },
                { type: 'healer', count: 1, interval: 3.0 }
            ],
            bonus: 80
        },

        // Wave 7: 물량 공세
        {
            enemies: [
                { type: 'scout', count: 15, interval: 0.6 },
                { type: 'soldier', count: 5, interval: 1.0 }
            ],
            bonus: 90
        },

        // Wave 8: 중장갑 공세
        {
            enemies: [
                { type: 'soldier', count: 8, interval: 0.8 },
                { type: 'tank', count: 3, interval: 2.0 }
            ],
            bonus: 100
        },

        // Wave 9: 최종 준비
        {
            enemies: [
                { type: 'scout', count: 10, interval: 0.6 },
                { type: 'soldier', count: 5, interval: 1.0 },
                { type: 'tank', count: 3, interval: 1.5 },
                { type: 'healer', count: 2, interval: 2.5 }
            ],
            bonus: 120
        },

        // Wave 10: 최종 웨이브 (Boss)
        {
            enemies: [
                { type: 'scout', count: 15, interval: 0.5 },
                { type: 'soldier', count: 8, interval: 0.8 },
                { type: 'tank', count: 2, interval: 1.8 },
                { type: 'boss', count: 1, interval: 5.0 }
            ],
            bonus: 150
        }
    ];

    console.log('[Sentinel] Wave data loaded:', Sentinel.data.waves.length, 'waves');
})();
