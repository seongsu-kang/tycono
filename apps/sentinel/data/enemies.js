// Sentinel - Enemy Data
// 적 5종

(function() {
    'use strict';

    Sentinel.data.enemies = {
        scout: {
            name: "Scout",
            hp: 50,
            speed: 96,  // 2.0 칸/s
            reward: 10,
            color: '#aa5555',
            size: 12
        },

        soldier: {
            name: "Soldier",
            hp: 120,
            speed: 72,  // 1.5 칸/s
            reward: 15,
            color: '#5555aa',
            size: 16
        },

        tank: {
            name: "Tank",
            hp: 300,
            speed: 38.4,  // 0.8 칸/s
            reward: 30,
            color: '#55aa55',
            size: 20,
            armor: 0.2  // 물리 저항 20%
        },

        healer: {
            name: "Healer",
            hp: 80,
            speed: 57.6,  // 1.2 칸/s
            reward: 25,
            color: '#aaaa55',
            size: 14,
            healRadius: 96,  // 2칸
            healRate: 5,  // 초당 5 HP
            healInterval: 1  // 1초마다 주변 적 회복
        },

        boss: {
            name: "Boss",
            hp: 1000,
            speed: 48,  // 1.0 칸/s (분노 시 1.5배 = 72)
            reward: 100,
            color: '#aa55aa',
            size: 28,
            armor: 0.3,  // 물리 저항 30%
            rage: true,  // HP 50% 이하 시 속도 1.5배
            rageSpeedMultiplier: 1.5
        }
    };

    console.log('[Sentinel] Enemy data loaded');
})();
