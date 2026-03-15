/* =========================================================
   Character Creator Component
   ========================================================= */

import { useState, useEffect, useRef } from 'react';
import * as TyconoForge from 'tyconoforge';
import type { CharacterAppearance, Character } from './types';

interface Props {
  onComplete: (character: Character) => void;
}

// 프리셋 색상
const SKIN_COLORS = ['#FFE0BD', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#6B4423'];
const HAIR_COLORS = ['#2C1B18', '#724133', '#C68642', '#E6BE8A', '#D4AF37', '#B94E48'];

// 랜덤 색상 생성 (hex)
function randomColor(): string {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

// 랜덤 배열 요소 선택
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function CharacterCreator({ onComplete }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);

  // 캐릭터 외형 상태
  const [name, setName] = useState('플레이어');
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    skinColor: SKIN_COLORS[0],
    hairColor: HAIR_COLORS[0],
    shirtColor: '#3498db',
    pantsColor: '#2C3E50',
    shoeColor: '#34495E',
    hairStyle: 'short',
    outfitStyle: 'tshirt',
    accessory: 'none',
  });

  // TyconoForge 렌더링 (실시간 프리뷰)
  useEffect(() => {
    if (!canvasRef.current) return;

    canvasRef.current.innerHTML = ''; // 이전 캔버스 제거

    const canvas = TyconoForge.render(appearance, { scale: 6 });
    canvasRef.current.appendChild(canvas);
  }, [appearance]);

  // 랜덤 생성
  const handleRandomize = () => {
    setAppearance({
      skinColor: randomChoice(SKIN_COLORS),
      hairColor: randomChoice(HAIR_COLORS),
      shirtColor: randomColor(),
      pantsColor: randomColor(),
      shoeColor: randomColor(),
      hairStyle: randomChoice(TyconoForge.HAIRSTYLES),
      outfitStyle: randomChoice(TyconoForge.OUTFITS),
      accessory: randomChoice(TyconoForge.ACCESSORIES),
    });
  };

  // 게임 시작
  const handleStart = () => {
    const character: Character = {
      appearance,
      stats: {
        name,
        level: 1,
        hp: 100,
        maxHp: 100,
        mp: 80,
        maxMp: 80,
        attack: 20,
        defense: 10,
      },
    };
    onComplete(character);
  };

  return (
    <div className="character-creator">
      <h1>캐릭터 생성</h1>

      <div className="creator-layout">
        {/* 왼쪽: 프리뷰 */}
        <div className="preview-section">
          <div className="preview-canvas" ref={canvasRef}></div>
        </div>

        {/* 오른쪽: 커스터마이징 */}
        <div className="customization-section">
          {/* 이름 */}
          <div className="form-group">
            <label>이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={10}
            />
          </div>

          {/* 피부색 */}
          <div className="form-group">
            <label>피부색</label>
            <div className="color-palette">
              {SKIN_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-btn ${appearance.skinColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAppearance({ ...appearance, skinColor: color })}
                />
              ))}
            </div>
          </div>

          {/* 헤어스타일 */}
          <div className="form-group">
            <label>헤어스타일</label>
            <select
              value={appearance.hairStyle}
              onChange={(e) => setAppearance({ ...appearance, hairStyle: e.target.value })}
            >
              {TyconoForge.HAIRSTYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>

          {/* 헤어 색상 */}
          <div className="form-group">
            <label>헤어 색상</label>
            <div className="color-palette">
              {HAIR_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-btn ${appearance.hairColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAppearance({ ...appearance, hairColor: color })}
                />
              ))}
            </div>
          </div>

          {/* 의상 */}
          <div className="form-group">
            <label>의상</label>
            <select
              value={appearance.outfitStyle}
              onChange={(e) => setAppearance({ ...appearance, outfitStyle: e.target.value })}
            >
              {TyconoForge.OUTFITS.map((outfit) => (
                <option key={outfit} value={outfit}>
                  {outfit}
                </option>
              ))}
            </select>
          </div>

          {/* 액세서리 */}
          <div className="form-group">
            <label>액세서리</label>
            <select
              value={appearance.accessory}
              onChange={(e) => setAppearance({ ...appearance, accessory: e.target.value })}
            >
              {TyconoForge.ACCESSORIES.slice(0, 15).map((acc) => (
                <option key={acc} value={acc}>
                  {acc}
                </option>
              ))}
            </select>
          </div>

          {/* 버튼 */}
          <div className="button-group">
            <button onClick={handleRandomize} className="btn-secondary">
              🎲 랜덤 생성
            </button>
            <button onClick={handleStart} className="btn-primary">
              ⚔️ 게임 시작!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
