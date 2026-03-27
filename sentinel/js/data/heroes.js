(function() {
    'use strict';
    var S = window.Sentinel;

    S.data.heroes = {
        kael: {
            name: 'Commander Kael',
            title: 'The Warlord',
            color: '#ffcc00',
            size: 1.0,
            moveSpeed: 200, // px/s
            attack: {
                damage: 15,
                attackSpeed: 1.5,
                range: 2 // grid cells
            },
            passive: {
                name: 'Commander\'s Aura',
                description: '+10% ATK to towers within 3 tiles',
                range: 3,
                atkBuff: 0.10
            },
            active: {
                name: 'Battle Cry',
                description: '+25% attack speed to ALL towers for 10s',
                duration: 10,
                cooldown: 45,
                spdBuff: 0.25
            }
        }
    };
})();
