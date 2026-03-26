// Sentinel - Enemy Data
// 적 5종

(function() {
    'use strict';

    Sentinel.data.enemies = {
        scout: {
            name: "Scout",
            hp: 40,
            speed: 80,
            reward: 5,
            color: '#FFD700',
            size: 12
        },

        soldier: {
            name: "Soldier",
            hp: 100,
            speed: 50,
            reward: 12,
            color: '#FF6B6B',
            size: 14
        },

        tank: {
            name: "Tank",
            hp: 300,
            speed: 30,
            reward: 30,
            color: '#555555',
            size: 18
        },

        healer: {
            name: "Healer",
            hp: 80,
            speed: 45,
            reward: 20,
            color: '#4ECDC4',
            size: 13,
            healRadius: 80,
            healRate: 10,
            healInterval: 2  // 2초마다 주변 적 회복
        },

        boss: {
            name: "Boss",
            hp: 800,
            speed: 25,
            reward: 150,
            color: '#8B00FF',
            size: 24
        }
    };

    console.log('[Sentinel] Enemy data loaded');
})();
