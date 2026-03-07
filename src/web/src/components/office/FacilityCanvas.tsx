import { useRef, useEffect } from 'react';
import { getFacilityBlueprint, renderFacility } from './sprites/engine';
import './sprites/data'; // trigger blueprint registration

type FacilityType = 'meeting' | 'bulletin' | 'decision' | 'knowledge';

interface Props {
  type: FacilityType;
  className?: string;
}

export default function FacilityCanvas({ type, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bp = getFacilityBlueprint(type);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bp) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderFacility(ctx, bp);
  }, [type, bp]);

  if (!bp) return null;

  return (
    <canvas
      ref={canvasRef}
      width={bp.canvasWidth}
      height={bp.canvasHeight}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
