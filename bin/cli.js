#!/usr/bin/env -S node --import tsx

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { main } = await import(join(__dirname, 'tycono.ts'));
await main(process.argv.slice(2));
