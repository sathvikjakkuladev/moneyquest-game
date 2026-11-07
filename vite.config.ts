import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Dev only: lets the ?dev=1 map editor save a zone's layout to src/data/rooms/<zone>.json.
 * It exists on the local dev server and is never part of the built website.
 */
function roomsEditor(): Plugin {
  return {
    name: 'moneyquest-rooms-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/rooms/', (req, res) => {
        const zone = (req.url ?? '').replace(/^\//, '').split('?')[0]!;
        if (req.method !== 'POST' || !/^[a-z_]+$/.test(zone)) {
          res.statusCode = 400;
          return res.end('bad request');
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.zone !== zone || typeof data.screens !== 'object') throw new Error('zone mismatch');
            writeFileSync(join(server.config.root, 'src', 'data', 'rooms', `${zone}.json`), JSON.stringify(data, null, 1) + '\n');
            res.end('saved');
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // Relative base so the static build works from any folder or host.
  base: './',
  plugins: [react(), tailwindcss(), roomsEditor()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { include: ['src/**/*.test.ts', 'tools/**/*.test.ts'], environment: 'node' },
});
