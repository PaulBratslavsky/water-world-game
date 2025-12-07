import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  server: {
    port: 5200,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  base: "/"
});
