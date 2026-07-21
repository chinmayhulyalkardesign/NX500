import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    // the game uses top-level await (model loading); esnext lets the production build keep it
    target: 'esnext',
    rollupOptions: {
      // multi-page: build BOTH the 2.5D game (side.html) and the 3D prototype (index.html)
      input: {
        side: resolve(process.cwd(), 'side.html'),
        main: resolve(process.cwd(), 'index.html'),
      },
    },
  },
});
