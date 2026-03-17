/**
 * TUI Entry Point — renders Ink app
 *
 * Usage:
 *   import { startTui } from './tui/index';
 *   await startTui({ port: 3000 });
 */

import React from 'react';
import { render } from 'ink';
import { App } from './app';
import { setBaseUrl } from './api';

export interface TuiOptions {
  port: number;
  host?: string;
}

export async function startTui(options: TuiOptions): Promise<void> {
  const host = options.host ?? 'localhost';
  setBaseUrl(`http://${host}:${options.port}`);

  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}
