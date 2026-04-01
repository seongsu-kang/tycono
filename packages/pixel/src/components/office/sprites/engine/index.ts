export type {
  ColorToken,
  Pixel,
  CharacterBlueprint,
  CharacterLayer,
  FacilityBlueprint,
  Direction,
  DirectionalLayers,
} from './blueprint';

export {
  darken,
  lighten,
  resolveColor,
  mirrorPixels,
  resolveDirectionalLayer,
  swapHairLayer,
  swapLayer,
  registerCharacter,
  registerFacility,
  getCharacterBlueprint,
  getFacilityBlueprint,
  getAllCharacterIds,
  getAllFacilityIds,
} from './blueprint';

export {
  renderCharacter,
  renderFacility,
  renderLayerToCanvas,
  composeLayers,
  renderPixelsAt,
} from './renderer';

export type { HairStyleMeta } from './hairstyles';

export {
  registerHairStyle,
  getHairStyle,
  getHairForDirection,
  getAllHairStyles,
  getHairRequiredLevel,
  isHairUnlocked,
  getHairCost,
} from './hairstyles';

export type { OutfitStyleMeta } from './outfits';

export {
  registerOutfitStyle,
  getOutfitStyle,
  getOutfitForDirection,
  getAllOutfitStyles,
  getOutfitRequiredLevel,
  isOutfitUnlocked,
  getOutfitCost,
} from './outfits';

export type { AccessoryMeta } from './accessories';

export {
  registerAccessory,
  getAccessory,
  getAccessoryForDirection,
  getAllAccessories,
  getAccessoryCost,
} from './accessories';

export { extractAppearance } from './color-extract';
