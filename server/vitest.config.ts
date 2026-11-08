import { defineConfig } from 'vitest/config';

// Server tests run the real request handler against Node's built-in SQLite with the real D1
// migrations applied (see test/d1.ts), so no Cloudflare account or local runtime is needed.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } });
