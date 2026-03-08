import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { tyconoforge: 'src/web/src/components/office/sprites/engine/forge-standalone.ts' },
  format: ['iife'],
  globalName: 'TyconoForge',
  outDir: 'src/web/dist',
  minify: true,
  noExternal: [/.*/],
  platform: 'browser',
  target: 'es2020',
  clean: false, // Don't clean — preserve existing Vite build output
  outExtension: () => ({ js: '.js' }),
});
