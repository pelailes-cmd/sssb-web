import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    // The Three.js scene is lazy-loaded; its measured minified chunk remains below this boundary.
    chunkSizeWarningLimit: 600,
  },
});
