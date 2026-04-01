/* =========================================================
   RPG Battle Logic
   ========================================================= */

import type { BattleState, SkillType, BattleAction, CharacterStats } from './types';

// 스킬 정의
export const SKILLS = {
  attack: { name: '공격', mpCost: 0, emoji: '⚔️' },
  defend: { name: '방어', mpCost: 0, emoji: '🛡️' },
  heal: { name: '회복', mpCost: 20, emoji: '💚' },
  flee: { name: '도망', mpCost: 0, emoji: '🏃' },
};

// 적 생성 (랜덤)
export function createEnemy(): CharacterStats {
  const enemies = [
    { name: '슬라임', hp: 50, attack: 8, defense: 3 },
    { name: '고블린', hp: 70, attack: 12, defense: 5 },
    { name: '해골', hp: 60, attack: 15, defense: 2 },
    { name: '오크', hp: 100, attack: 18, defense: 8 },
  ];

  const template = enemies[Math.floor(Math.random() * enemies.length)];

  return {
    name: template.name,
    level: 1,
    hp: template.hp,
    maxHp: template.hp,
    mp: 0,
    maxMp: 0,
    attack: template.attack,
    defense: template.defense,
  };
}

// 데미지 계산
function calculateDamage(attacker: CharacterStats, defender: CharacterStats, isDefending: boolean): number {
  const baseDamage = attacker.attack - defender.defense / 2;
  const damage = Math.max(1, Math.floor(baseDamage));
  return isDefending ? Math.floor(damage * 0.5) : damage;
}

// 플레이어 액션 처리
export function executePlayerAction(
  state: BattleState,
  skill: SkillType
): { newState: BattleState; continueToEnemyTurn: boolean } {
  const newState = { ...state };

  // MP 체크
  if (skill === 'heal' && newState.player.mp < SKILLS.heal.mpCost) {
    return { newState, continueToEnemyTurn: false }; // MP 부족 - 턴 넘어가지 않음
  }

  let action: BattleAction;

  switch (skill) {
    case 'attack': {
      const damage = calculateDamage(newState.player, newState.enemy, false);
      newState.enemy.hp = Math.max(0, newState.enemy.hp - damage);
      action = {
        actorName: newState.player.name,
        skill: 'attack',
        damage,
        message: `${newState.player.name}의 공격! ${damage} 데미지!`,
      };
      newState.defendActive = false;
      break;
    }

    case 'defend': {
      newState.defendActive = true;
      action = {
        actorName: newState.player.name,
        skill: 'defend',
        message: `${newState.player.name}이(가) 방어 태세를 취했다!`,
      };
      break;
    }

    case 'heal': {
      const healAmount = 30;
      const actualHeal = Math.min(healAmount, newState.player.maxHp - newState.player.hp);
      newState.player.hp = Math.min(newState.player.maxHp, newState.player.hp + healAmount);
      newState.player.mp -= SKILLS.heal.mpCost;
      action = {
        actorName: newState.player.name,
        skill: 'heal',
        heal: actualHeal,
        message: `${newState.player.name}이(가) 회복! HP +${actualHeal}`,
      };
      newState.defendActive = false;
      break;
    }

    case 'flee': {
      const success = Math.random() < 0.5;
      if (success) {
        newState.status = 'fled';
        action = {
          actorName: newState.player.name,
          skill: 'flee',
          message: `${newState.player.name}이(가) 도망쳤다!`,
        };
      } else {
        action = {
          actorName: newState.player.name,
          skill: 'flee',
          message: `도망에 실패했다!`,
        };
      }
      newState.defendActive = false;
      break;
    }
  }

  newState.log = [...newState.log, action];

  // 적 HP 체크
  if (newState.enemy.hp <= 0) {
    newState.status = 'victory';
    return { newState, continueToEnemyTurn: false };
  }

  // 도망 성공
  if (newState.status === 'fled') {
    return { newState, continueToEnemyTurn: false };
  }

  return { newState, continueToEnemyTurn: true };
}

// 적 턴 (랜덤 스킬)
export function executeEnemyTurn(state: BattleState): BattleState {
  const newState = { ...state };

  // 적은 항상 공격만 함 (단순화)
  const damage = calculateDamage(newState.enemy, newState.player, newState.defendActive);
  newState.player.hp = Math.max(0, newState.player.hp - damage);

  const action: BattleAction = {
    actorName: newState.enemy.name,
    skill: 'attack',
    damage,
    message: `${newState.enemy.name}의 공격! ${damage} 데미지!`,
  };

  newState.log = [...newState.log, action];
  newState.defendActive = false; // 방어 해제

  // 플레이어 HP 체크
  if (newState.player.hp <= 0) {
    newState.status = 'defeat';
  }

  return newState;
}

// 초기 배틀 상태 생성
export function createBattleState(player: CharacterStats, enemy: CharacterStats): BattleState {
  return {
    player,
    enemy,
    turn: 'player',
    log: [],
    defendActive: false,
    status: 'ongoing',
  };
}
