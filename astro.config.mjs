import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://crowfliesdistancecalculator.com',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  integrations: [react(), mdx()],
  vite: { build: { chunkSizeWarningLimit: 1200 } },
});
