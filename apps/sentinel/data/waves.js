// Sentinel - Wave Data
// 10웨이브 점진적 난이도

(function() {
    'use strict';

    Sentinel.data.waves = [
        // Wave 1: 튜토리얼 수준
        {
            enemies: [
                { type: 'scout', count: 8, interval: 1.2 }
            ],
            bonus: 50
        },

        // Wave 2: Scout + Soldier 첫 등장
        {
            enemies: [
                { type: 'scout', count: 10, interval: 1.0 },
                { type: 'soldier', count: 3, interval: 2.0 }
            ],
            bonus: 75
        },

        // Wave 3: 혼합 구성
        {
            enemies: [
                { type: 'scout', count: 12, interval: 0.8 },
                { type: 'soldier', count: 5, interval: 1.5 }
            ],
            bonus: 100
        },

        // Wave 4: Tank 첫 등장
        {
            enemies: [
                { type: 'scout', count: 15, interval: 0.7 },
                { type: 'soldier', count: 6, interval: 1.2 },
                { type: 'tank', count: 2, interval: 3.0 }
            ],
            bonus: 125
        },

        // Wave 5: Healer 첫 등장 (중간 보스)
        {
            enemies: [
                { type: 'soldier', count: 10, interval: 1.0 },
                { type: 'tank', count: 3, interval: 2.5 },
                { type: 'healer', count: 2, interval: 4.0 }
            ],
            bonus: 150
        },

        // Wave 6: 밀도 증가
        {
            enemies: [
                { type: 'scout', count: 20, interval: 0.5 },
                { type: 'soldier', count: 8, interval: 1.0 },
                { type: 'tank', count: 4, interval: 2.0 },
                { type: 'healer', count: 2, interval: 3.5 }
            ],
            bonus: 175
        },

        // Wave 7: 고난이도
        {
            enemies: [
                { type: 'soldier', count: 15, interval: 0.8 },
                { type: 'tank', count: 6, interval: 1.5 },
                { type: 'healer', count: 3, interval: 3.0 }
            ],
            bonus: 200
        },

        // Wave 8: Boss 경고
        {
            enemies: [
                { type: 'scout', count: 25, interval: 0.4 },
                { type: 'soldier', count: 12, interval: 0.8 },
                { type: 'tank', count: 8, interval: 1.2 },
                { type: 'healer', count: 4, interval: 2.5 }
            ],
            bonus: 250
        },

        // Wave 9: Boss 첫 등장
        {
            enemies: [
                { type: 'tank', count: 10, interval: 1.0 },
                { type: 'healer', count: 5, interval: 2.0 },
                { type: 'boss', count: 1, interval: 5.0 }
            ],
            bonus: 300
        },

        // Wave 10: 최종 웨이브
        {
            enemies: [
                { type: 'scout', count: 30, interval: 0.3 },
                { type: 'soldier', count: 15, interval: 0.6 },
                { type: 'tank', count: 12, interval: 0.9 },
                { type: 'healer', count: 6, interval: 2.0 },
                { type: 'boss', count: 2, interval: 8.0 }
            ],
            bonus: 500
        }
    ];

    console.log('[Sentinel] Wave data loaded:', Sentinel.data.waves.length, 'waves');
})();
