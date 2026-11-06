import { defineConfig } from 'vite';

// BASE_PATH permite fijar la ruta base (p. ej. "/dragon-ball-adventure-blast/").
// Por defecto './' genera rutas relativas válidas en cualquier hosting estático.
export default defineConfig({
  base: process.env.BASE_PATH || './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
  },
});
