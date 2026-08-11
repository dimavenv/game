import { defineConfig } from 'vite';

// base: './' — сборка работает и с file://-подобных путей, и с GitHub Pages,
// не привязываясь к имени репозитория.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', outDir: 'dist' },
});
