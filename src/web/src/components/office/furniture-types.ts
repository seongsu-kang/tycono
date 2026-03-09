/* ═══════════════════════════════════════════
   Furniture Types — Data-Driven Definitions
   Phase 1: Room-relative offset system
   ═══════════════════════════════════════════ */

export type FurnitureType =
  | 'bookshelf' | 'plant' | 'meeting-table' | 'sofa'
  | 'coffee-table' | 'coffee-machine'
  | 'window' | 'picture' | 'clock' | 'whiteboard'
  | 'bulletin-board' | 'shelf' | 'screen'
  | 'aquarium' | 'neon-sign' | 'arcade' | 'jukebox' | 'trophy-case';

export type PlacementZone = 'wall' | 'floor';
export type AnchorX = 'left' | 'right';

export interface FacilityInfo {
  id: string;
  label: string;
  icon: string;
  color: string;
  hitW: number;
  hitH: number;
}

export interface FurnitureDef {
  id: string;
  type: FurnitureType;
  room: string;
  zone: PlacementZone;
  anchorX?: AnchorX;       // default 'left'; 'right' = baseX is room right edge
  offsetX: number;
  offsetY: number;
  accent?: string;         // bookshelf accent color
  pictureColor?: string;   // picture frame color
  windowW?: number;        // window dimensions override
  windowH?: number;
  condition?: 'no-desks';  // only render when room has no desks
  facility?: FacilityInfo;
  w?: number; h?: number;  // furniture dimensions (for Phase 2)
}

/* ─── Furniture Catalog (for add palette) ─ */

export interface CatalogEntry {
  type: FurnitureType;
  zone: PlacementZone;
  label: string;
  icon: string;
  price: number;        // 0 = free
}

export const FURNITURE_CATALOG: CatalogEntry[] = [
  // Free
  { type: 'plant', zone: 'floor', label: 'Plant', icon: '🪴', price: 0 },
  { type: 'clock', zone: 'wall', label: 'Clock', icon: '🕐', price: 0 },
  // Basic (500~1K)
  { type: 'bookshelf', zone: 'floor', label: 'Bookshelf', icon: '📚', price: 500 },
  { type: 'picture', zone: 'wall', label: 'Picture', icon: '🖼️', price: 500 },
  { type: 'shelf', zone: 'wall', label: 'Shelf', icon: '📦', price: 800 },
  { type: 'window', zone: 'wall', label: 'Window', icon: '🪟', price: 1000 },
  // Standard (1.5K~3K)
  { type: 'sofa', zone: 'floor', label: 'Sofa', icon: '🛋️', price: 1500 },
  { type: 'coffee-table', zone: 'floor', label: 'Coffee Table', icon: '☕', price: 1500 },
  { type: 'coffee-machine', zone: 'floor', label: 'Coffee Machine', icon: '☕', price: 2000 },
  // Premium (3K~5K)
  { type: 'meeting-table', zone: 'floor', label: 'Meeting Table', icon: '🪑', price: 3000 },
  { type: 'whiteboard', zone: 'wall', label: 'Whiteboard', icon: '📋', price: 3000 },
  { type: 'screen', zone: 'wall', label: 'Screen', icon: '🖥️', price: 5000 },
  // Special (5K~10K)
  { type: 'aquarium', zone: 'floor', label: 'Aquarium', icon: '🐠', price: 5000 },
  { type: 'neon-sign', zone: 'wall', label: 'Neon Sign', icon: '💡', price: 3000 },
  { type: 'arcade', zone: 'floor', label: 'Arcade', icon: '🕹️', price: 8000 },
  { type: 'jukebox', zone: 'floor', label: 'Jukebox', icon: '🎵', price: 6000 },
  { type: 'trophy-case', zone: 'floor', label: 'Trophy Case', icon: '🏆', price: 7000 },
];
