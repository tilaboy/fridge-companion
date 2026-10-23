import { defineConfig } from 'vite';

/* One static shell, built once, served from any subpath. `base: './'` keeps
 * every asset URL relative so a fork can publish under its own Pages path
 * without editing anything. */
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
