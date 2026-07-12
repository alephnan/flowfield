import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    // inotify events don't propagate across the WSL2 /mnt/c boundary
    watch: { usePolling: true, interval: 400 },
  },
});
