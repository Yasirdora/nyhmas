import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The playground consumes the package SOURCE (alias → ../src) instead of the
 * built dist-package, so edits to the engine/effects hot-reload while
 * iterating. The built artifact itself is verified by examples/*, which
 * consume dist-package exactly like npm users do.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      nyhmas: new URL('../src/index.ts', import.meta.url).pathname,
    },
  },
  server: {
    // Allow the dev server to serve the package source outside this root.
    fs: { allow: ['..'] },
  },
});
