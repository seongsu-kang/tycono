/**
 * TUI Entry Point — renders Ink app
 *
 * Usage:
 *   import { startTui } from './tui/index.js';
 *   await startTui({ port: 3000 });
 */

import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import { setBaseUrl } from './api.js';

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
