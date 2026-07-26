import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  // GitHub project Pages sites are served below the repository-name path.
  base: mode === 'github-pages' ? '/sssb-web/' : '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    // The Three.js scene is lazy-loaded; its measured minified chunk remains below this boundary.
    chunkSizeWarningLimit: 600,
  },
}));
