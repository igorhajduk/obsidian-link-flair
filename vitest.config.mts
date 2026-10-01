import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { obsidian: fileURLToPath(new URL('tests/support/obsidian.ts', import.meta.url)) } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['tests/support/dom.ts'], restoreMocks: true },
});
