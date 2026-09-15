import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // The site is served from the root of its own domain (smartsavesolar.lifestyle), so there is no
  // base path. It used to be '/sssb-web/' for the `github-pages` mode, because a project Pages site
  // sits below the repository name — if the custom domain is ever dropped and the site goes back to
  // pelailes-cmd.github.io/sssb-web/, that conditional has to come back or every asset will 404.
  base: '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    // The Three.js scene is lazy-loaded; its measured minified chunk remains below this boundary.
    chunkSizeWarningLimit: 600,
  },
});
