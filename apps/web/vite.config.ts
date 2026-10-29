import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error plain JS helper shared with the API build
import { appVersion } from '../../scripts/app-version.mjs';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: {
    host: '0.0.0.0',
    proxy: { '/api': 'http://localhost:8080' },
  },
});
