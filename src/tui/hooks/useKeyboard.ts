/**
 * useKeyboard — global keyboard shortcuts for TUI
 */

import { useInput } from 'ink';

export interface KeyboardActions {
  onWave(): void;
  onQuit(): void;
  onHelp(): void;
  onTab(): void;
  onUp(): void;
  onDown(): void;
  onEnter(): void;
  onEscape(): void;
}

export function useKeyboard(actions: KeyboardActions, enabled: boolean): void {
  useInput((input, key) => {
    if (!enabled) return;

    if (input === 'w') {
      actions.onWave();
      return;
    }

    if (input === 'q') {
      actions.onQuit();
      return;
    }

    if (input === '?') {
      actions.onHelp();
      return;
    }

    if (key.tab) {
      actions.onTab();
      return;
    }

    if (key.upArrow || input === 'k') {
      actions.onUp();
      return;
    }

    if (key.downArrow || input === 'j') {
      actions.onDown();
      return;
    }

    if (key.return) {
      actions.onEnter();
      return;
    }

    if (key.escape) {
      actions.onEscape();
      return;
    }
  });
}
