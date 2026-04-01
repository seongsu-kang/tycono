/* Sprite Preview — renders all registered blueprints for visual QA.
   Access via: http://localhost:5173/sprite-preview */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { CharacterAppearance } from '../../../types/appearance';
import { SKIN_PRESETS, HAIR_PRESETS, SHIRT_PRESETS, PANTS_PRESETS, SHOE_PRESETS } from '../../../types/appearance';
import {
  getAllCharacterIds,
  getAllFacilityIds,
  getCharacterBlueprint,
  getFacilityBlueprint,
  renderCharacter,
  renderFacility,
} from './engine';

// Trigger registration
import './data';

function CharCard({ id, ap, bobY, layers }: { id: string; ap: CharacterAppearance; bobY: number; layers: Set<string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bp = getCharacterBlueprint(id);

  useEffect(() => {
    if (!bp || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Filter layers
    const filteredBp = {
      ...bp,
      layers: bp.layers.filter(l => layers.has(l.name)),
    };
    renderCharacter(ctx, filteredBp, bobY, ap);
  }, [bp, ap, bobY, layers]);

  if (!bp) return null;

  return (
    <div style={{
      background: '#161b22', border: '1px solid #21262d', borderRadius: 8,
      padding: 16, textAlign: 'center', minWidth: 140,
    }}>
      <canvas
        ref={canvasRef}
        width={bp.width * 2}
        height={bp.height * 2}
        style={{ imageRendering: 'pixelated', display: 'block', margin: '0 auto 8px', width: bp.width * 6, height: bp.height * 6, border: '1px solid #30363d', background: '#0d1117' }}
      />
      <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 1 }}>{id}</div>
    </div>
  );
}

function FacCard({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bp = getFacilityBlueprint(id);

  useEffect(() => {
    if (!bp || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    renderFacility(ctx, bp);
  }, [bp]);

  if (!bp) return null;

  return (
    <div style={{
      background: '#161b22', border: '1px solid #21262d', borderRadius: 8,
      padding: 16, textAlign: 'center',
    }}>
      <canvas
        ref={canvasRef}
        width={bp.canvasWidth}
        height={bp.canvasHeight}
        style={{ imageRendering: 'pixelated', display: 'block', margin: '0 auto 8px', width: bp.canvasWidth * 2, height: bp.canvasHeight * 2, border: '1px solid #30363d', background: '#0d1117' }}
      />
      <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 1 }}>{id}</div>
    </div>
  );
}

const ALL_LAYERS = ['body', 'hair', 'face', 'accessory', 'item', 'legs'];

export default function SpritePreview() {
  const [ap, setAp] = useState<CharacterAppearance>({
    skinColor: '#F5CBA7', hairColor: '#2C1810', shirtColor: '#1565C0',
    pantsColor: '#37474F', shoeColor: '#212121',
  });
  const [layers, setLayers] = useState(new Set(ALL_LAYERS));
  const [bobY, setBobY] = useState(0);
  const frameRef = useRef(0);

  // Animation
  useEffect(() => {
    const tick = () => {
      frameRef.current++;
      setBobY((frameRef.current % 60) < 30 ? 1 : 0);
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const charIds = getAllCharacterIds();
  const facIds = getAllFacilityIds();

  const toggleLayer = useCallback((name: string) => {
    setLayers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const randomize = useCallback(() => {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    setAp({
      skinColor: pick(SKIN_PRESETS),
      hairColor: pick(HAIR_PRESETS),
      shirtColor: pick(SHIRT_PRESETS),
      pantsColor: pick(PANTS_PRESETS),
      shoeColor: pick(SHOE_PRESETS),
    });
  }, []);

  return (
    <div style={{ fontFamily: "'SF Mono', monospace", background: '#0d1117', color: '#e6edf3', padding: 24, minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, color: '#58a6ff', marginBottom: 4 }}>Sprite Blueprint Preview</h1>
      <p style={{ fontSize: 12, color: '#484f58', marginBottom: 16 }}>All sprites rendered from declarative Blueprint data</p>

      {/* Color Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 12, background: '#161b22', border: '1px solid #21262d', borderRadius: 8, marginBottom: 12, alignItems: 'center' }}>
        {([['Skin', 'skinColor'], ['Hair', 'hairColor'], ['Shirt', 'shirtColor'], ['Pants', 'pantsColor'], ['Shoes', 'shoeColor']] as const).map(([label, key]) => (
          <label key={key} style={{ fontSize: 11, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4 }}>
            {label}
            <input
              type="color"
              value={ap[key]}
              onChange={e => setAp(prev => ({ ...prev, [key]: e.target.value }))}
              style={{ width: 28, height: 28, border: '1px solid #30363d', borderRadius: 4, background: 'none', cursor: 'pointer' }}
            />
          </label>
        ))}
        <button onClick={randomize} style={{ background: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: 4, padding: '4px 12px', fontSize: 11, cursor: 'pointer' }}>Random</button>
      </div>

      {/* Layer toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ALL_LAYERS.map(name => (
          <label key={name} style={{ fontSize: 11, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={layers.has(name)} onChange={() => toggleLayer(name)} />
            {name}
          </label>
        ))}
      </div>

      <h2 style={{ fontSize: 14, color: '#8b949e', margin: '24px 0 12px', borderBottom: '1px solid #21262d', paddingBottom: 6 }}>
        Characters ({charIds.length})
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {charIds.map(id => <CharCard key={id} id={id} ap={ap} bobY={bobY} layers={layers} />)}
      </div>

      <h2 style={{ fontSize: 14, color: '#8b949e', margin: '24px 0 12px', borderBottom: '1px solid #21262d', paddingBottom: 6 }}>
        Facilities ({facIds.length})
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        {facIds.map(id => <FacCard key={id} id={id} />)}
      </div>
    </div>
  );
}
