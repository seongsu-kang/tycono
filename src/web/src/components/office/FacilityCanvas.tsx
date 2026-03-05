import { useRef, useEffect } from 'react';
import { drawMeetingTable, drawBulletin, drawCabinet, drawKnowledgeShelf } from './sprites/spriteDrawing';

type FacilityType = 'meeting' | 'bulletin' | 'decision' | 'knowledge';

interface Config {
  drawFn: (ctx: CanvasRenderingContext2D) => void;
  width: number;
  height: number;
}

const FACILITY_CONFIG: Record<FacilityType, Config> = {
  meeting:   { drawFn: drawMeetingTable,    width: 160, height: 80  },
  bulletin:  { drawFn: drawBulletin,        width: 128, height: 96  },
  decision:  { drawFn: drawCabinet,         width: 96,  height: 120 },
  knowledge: { drawFn: drawKnowledgeShelf,  width: 128, height: 96  },
};

interface Props {
  type: FacilityType;
  className?: string;
}

export default function FacilityCanvas({ type, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const config = FACILITY_CONFIG[type];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    config.drawFn(ctx);
  }, [type, config]);

  return (
    <canvas
      ref={canvasRef}
      width={config.width}
      height={config.height}
      className={className}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
