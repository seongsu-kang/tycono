/* =========================================================
   STORE CHARACTERS — loaded from Cloud API (api.tycono.ai)
   Local fallback array is empty. All characters live in the cloud.
   ========================================================= */

import type { StoreCharacter } from '../types/store';

export const STORE_CHARACTERS: StoreCharacter[] = [];

export function getFeaturedCharacters(): StoreCharacter[] {
  return STORE_CHARACTERS.filter(c => c.featured);
}

export function getCharacterById(id: string): StoreCharacter | undefined {
  return STORE_CHARACTERS.find(c => c.id === id);
}

export function getRandomActiveCharacters(): StoreCharacter[] {
  return STORE_CHARACTERS.filter(c => c.randomActive);
}
