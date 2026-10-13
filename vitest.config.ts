import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// The app's own aliases live in electron.vite.config.ts. Vitest doesn't read
// that file, so without these a test that imports anything reaching the db or
// the shared status helpers fails to resolve `@shared/...`. Existing tests only
// ever imported leaf modules, which is why this never surfaced before.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})