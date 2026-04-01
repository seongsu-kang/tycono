/* =========================================================
   RPG Game Entry Point
   ========================================================= */

import { useState } from 'react';
import { CharacterCreator } from './CharacterCreator';
import { BattleScreen } from './BattleScreen';
import type { Character } from './types';
import './styles.css';

type GameState = 'create' | 'battle';

export default function RPGGame() {
  const [gameState, setGameState] = useState<GameState>('create');
  const [player, setPlayer] = useState<Character | null>(null);

  const handleCharacterCreated = (character: Character) => {
    setPlayer(character);
    setGameState('battle');
  };

  const handleRestart = () => {
    setPlayer(null);
    setGameState('create');
  };

  return (
    <div className="rpg-game">
      {gameState === 'create' && <CharacterCreator onComplete={handleCharacterCreated} />}
      {gameState === 'battle' && player && <BattleScreen player={player} onRestart={handleRestart} />}
    </div>
  );
}
