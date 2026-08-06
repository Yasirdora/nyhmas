import { defineConfig } from 'vite';

/**
 * Library build for the npm package. Bundles src/index.ts into a single ESM
 * entry (native-ESM-safe, no extensionless imports), keeping each effect a
 * lazily-fetched chunk via its dynamic import. `three` stays external — it is
 * a peer dependency, so consumers share their own copy.
 */
export default defineConfig({
  // The app's public/ dir (favicon, demo track) is not package content.
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-package',
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // Runtime dependencies stay external: npm installs them for consumers,
      // so they aren't duplicated inside the bundle.
      external: (id) => id === 'three' || id === 'mediabunny',
    },
  },
});
