import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { devAi } from './scripts/dev-ai';

export default defineConfig(({ mode }) => ({
  // Only keys without a VITE_ prefix are read here, so nothing reaches the browser bundle.
  plugins: [react(), devAi(loadEnv(mode, process.cwd(), ''))],
  base: './',
  build: { outDir: 'dist', sourcemap: false },
}));
