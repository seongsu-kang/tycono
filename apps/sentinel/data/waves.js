// Sentinel - Wave Data (wave-design.md 상세 스폰 패턴)

(function() {
    'use strict';

    Sentinel.data.waves = [
        // Wave 1: 튜토리얼
        {
            enemies: [
                { type: 'scout', count: 5, interval: 1.0, startDelay: 3 },
                { type: 'scout', count: 5, interval: 1.0, startDelay: 9 }
            ],
            bonus: 30
        },
        // Wave 2: Soldier 첫 등장
        {
            enemies: [
                { type: 'scout', count: 4, interval: 1.0, startDelay: 3 },
                { type: 'soldier', count: 2, interval: 1.5, startDelay: 8 },
                { type: 'scout', count: 4, interval: 1.0, startDelay: 12 },
                { type: 'soldier', count: 1, interval: 1.0, startDelay: 17 }
            ],
            bonus: 40
        },
        // Wave 3: 본격 전투
        {
            enemies: [
                { type: 'scout', count: 3, interval: 1.0, startDelay: 3 },
                { type: 'soldier', count: 3, interval: 1.5, startDelay: 7 },
                { type: 'scout', count: 2, interval: 1.0, startDelay: 13 },
                { type: 'soldier', count: 3, interval: 1.5, startDelay: 16 }
            ],
            bonus: 50
        },
        // Wave 4: Tank 첫 등장
        {
            enemies: [
                { type: 'soldier', count: 4, interval: 1.5, startDelay: 3 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 10 },
                { type: 'soldier', count: 4, interval: 1.5, startDelay: 14 }
            ],
            bonus: 60
        },
        // Wave 5: Healer 첫 등장
        {
            enemies: [
                { type: 'scout', count: 5, interval: 1.0, startDelay: 3 },
                { type: 'healer', count: 1, interval: 1.0, startDelay: 9 },
                { type: 'scout', count: 5, interval: 1.0, startDelay: 11 },
                { type: 'healer', count: 1, interval: 1.0, startDelay: 17 }
            ],
            bonus: 70
        },
        // Wave 6: 복합 구성
        {
            enemies: [
                { type: 'soldier', count: 3, interval: 1.5, startDelay: 3 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 8 },
                { type: 'healer', count: 1, interval: 1.0, startDelay: 11 },
                { type: 'soldier', count: 3, interval: 1.5, startDelay: 13 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 18 }
            ],
            bonus: 80
        },
        // Wave 7: 물량 공세
        {
            enemies: [
                { type: 'scout', count: 5, interval: 0.8, startDelay: 3 },
                { type: 'soldier', count: 3, interval: 1.5, startDelay: 8 },
                { type: 'scout', count: 5, interval: 0.8, startDelay: 14 },
                { type: 'soldier', count: 2, interval: 1.5, startDelay: 19 },
                { type: 'scout', count: 5, interval: 0.8, startDelay: 23 }
            ],
            bonus: 90
        },
        // Wave 8: 중장갑 공세
        {
            enemies: [
                { type: 'soldier', count: 4, interval: 1.5, startDelay: 3 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 10 },
                { type: 'soldier', count: 4, interval: 1.5, startDelay: 14 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 21 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 25 }
            ],
            bonus: 100
        },
        // Wave 9: 최종 준비
        {
            enemies: [
                { type: 'scout', count: 5, interval: 0.8, startDelay: 3 },
                { type: 'soldier', count: 3, interval: 1.5, startDelay: 8 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 14 },
                { type: 'healer', count: 1, interval: 1.0, startDelay: 16 },
                { type: 'scout', count: 5, interval: 0.8, startDelay: 18 },
                { type: 'soldier', count: 2, interval: 1.5, startDelay: 23 },
                { type: 'tank', count: 2, interval: 2.0, startDelay: 27 },
                { type: 'healer', count: 1, interval: 1.0, startDelay: 32 }
            ],
            bonus: 120
        },
        // Wave 10: 최종 웨이브 (Boss)
        {
            enemies: [
                { type: 'scout', count: 5, interval: 0.8, startDelay: 3 },
                { type: 'soldier', count: 4, interval: 1.0, startDelay: 8 },
                { type: 'scout', count: 5, interval: 0.8, startDelay: 13 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 18 },
                { type: 'scout', count: 5, interval: 0.8, startDelay: 20 },
                { type: 'soldier', count: 4, interval: 1.0, startDelay: 25 },
                { type: 'tank', count: 1, interval: 1.0, startDelay: 30 },
                { type: 'boss', count: 1, interval: 1.0, startDelay: 33 }
            ],
            bonus: 150
        }
    ];

    console.log('[Sentinel] Wave data loaded:', Sentinel.data.waves.length, 'waves');
})();
