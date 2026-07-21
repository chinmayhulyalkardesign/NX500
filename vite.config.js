import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    // the game uses top-level await (model loading); esnext lets the production build keep it
    target: 'esnext',
    rollupOptions: {
      // index.html IS the 2.5D game (served at the site root); the old 3D prototype lives at /prototype.html
      input: {
        main: resolve(process.cwd(), 'index.html'),
        prototype: resolve(process.cwd(), 'prototype.html'),
      },
    },
  },
});
