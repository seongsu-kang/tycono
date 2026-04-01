/* =========================================================
   Battle Screen Component
   ========================================================= */

import { useState, useEffect, useRef } from 'react';
import * as TyconoForge from 'tyconoforge';
import type { Character, CharacterAppearance, BattleState, SkillType } from './types';
import {
  createBattleState,
  createEnemy,
  executePlayerAction,
  executeEnemyTurn,
  SKILLS,
} from './battleLogic';

interface Props {
  player: Character;
  onRestart: () => void;
}

// 적 외형 (간단한 랜덤)
function createEnemyAppearance(): CharacterAppearance {
  return {
    skinColor: '#6B8E23',
    hairColor: '#2F4F2F',
    shirtColor: '#8B4513',
    pantsColor: '#654321',
    shoeColor: '#3E2723',
    hairStyle: 'messy',
    outfitStyle: 'vest',
    accessory: 'horns',
  };
}

export function BattleScreen({ player, onRestart }: Props) {
  const playerCanvasRef = useRef<HTMLDivElement>(null);
  const enemyCanvasRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [enemyAppearance] = useState<CharacterAppearance>(createEnemyAppearance());
  const [battle, setBattle] = useState<BattleState>(() =>
    createBattleState(player.stats, createEnemy())
  );

  // 캐릭터 렌더링
  useEffect(() => {
    if (playerCanvasRef.current) {
      playerCanvasRef.current.innerHTML = '';
      const canvas = TyconoForge.render(player.appearance, { scale: 6 });
      playerCanvasRef.current.appendChild(canvas);
    }

    if (enemyCanvasRef.current) {
      enemyCanvasRef.current.innerHTML = '';
      const canvas = TyconoForge.render(enemyAppearance, { scale: 6 });
      enemyCanvasRef.current.appendChild(canvas);
    }
  }, [player.appearance, enemyAppearance]);

  // 배틀 로그 자동 스크롤
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [battle.log]);

  // 스킬 사용
  const handleSkill = (skill: SkillType) => {
    if (battle.status !== 'ongoing') return;

    // 플레이어 턴 실행
    const { newState, continueToEnemyTurn } = executePlayerAction(battle, skill);
    setBattle(newState);

    // 적 턴으로 이어지면 0.8초 후 실행
    if (continueToEnemyTurn && newState.status === 'ongoing') {
      setTimeout(() => {
        setBattle((prev) => {
          if (prev.status !== 'ongoing') return prev;
          return executeEnemyTurn(prev);
        });
      }, 800);
    }
  };

  // HP 바 계산
  const playerHpPercent = (battle.player.hp / battle.player.maxHp) * 100;
  const enemyHpPercent = (battle.enemy.hp / battle.enemy.maxHp) * 100;
  const playerMpPercent = (battle.player.mp / battle.player.maxMp) * 100;

  return (
    <div className="battle-screen">
      <h1>⚔️ 배틀!</h1>

      {/* 캐릭터 영역 */}
      <div className="battle-characters">
        <div className="character-box">
          <div className="character-canvas" ref={playerCanvasRef}></div>
          <div className="character-name">{battle.player.name}</div>
          <div className="stat-bar">
            <div className="stat-label">
              HP: {battle.player.hp}/{battle.player.maxHp}
            </div>
            <div className="stat-bar-bg">
              <div className="stat-bar-fill hp" style={{ width: `${playerHpPercent}%` }}></div>
            </div>
          </div>
          <div className="stat-bar">
            <div className="stat-label">
              MP: {battle.player.mp}/{battle.player.maxMp}
            </div>
            <div className="stat-bar-bg">
              <div className="stat-bar-fill mp" style={{ width: `${playerMpPercent}%` }}></div>
            </div>
          </div>
        </div>

        <div className="vs-text">VS</div>

        <div className="character-box">
          <div className="character-canvas" ref={enemyCanvasRef}></div>
          <div className="character-name">{battle.enemy.name}</div>
          <div className="stat-bar">
            <div className="stat-label">
              HP: {battle.enemy.hp}/{battle.enemy.maxHp}
            </div>
            <div className="stat-bar-bg">
              <div className="stat-bar-fill hp" style={{ width: `${enemyHpPercent}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* 배틀 로그 */}
      <div className="battle-log" ref={logRef}>
        {battle.log.length === 0 && <div className="log-entry">배틀 시작!</div>}
        {battle.log.map((entry, i) => (
          <div key={i} className="log-entry">
            &gt; {entry.message}
          </div>
        ))}
      </div>

      {/* 결과 화면 */}
      {battle.status !== 'ongoing' && (
        <div className="battle-result">
          {battle.status === 'victory' && <h2>🎉 승리!</h2>}
          {battle.status === 'defeat' && <h2>💀 패배...</h2>}
          {battle.status === 'fled' && <h2>🏃 도망쳤다!</h2>}
          <button onClick={onRestart} className="btn-primary">
            다시 시작
          </button>
        </div>
      )}

      {/* 스킬 버튼 */}
      {battle.status === 'ongoing' && (
        <div className="skill-buttons">
          <button onClick={() => handleSkill('attack')} className="skill-btn">
            {SKILLS.attack.emoji} {SKILLS.attack.name}
          </button>
          <button onClick={() => handleSkill('defend')} className="skill-btn">
            {SKILLS.defend.emoji} {SKILLS.defend.name}
          </button>
          <button
            onClick={() => handleSkill('heal')}
            className="skill-btn"
            disabled={battle.player.mp < SKILLS.heal.mpCost}
          >
            {SKILLS.heal.emoji} {SKILLS.heal.name}
            <span className="mp-cost">(MP {SKILLS.heal.mpCost})</span>
          </button>
          <button onClick={() => handleSkill('flee')} className="skill-btn">
            {SKILLS.flee.emoji} {SKILLS.flee.name}
          </button>
        </div>
      )}
    </div>
  );
}
