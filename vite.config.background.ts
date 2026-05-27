import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/background/index.ts'),
      formats: ['iife'],
      name: 'PMBackground',
      fileName: () => 'background/index.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});
