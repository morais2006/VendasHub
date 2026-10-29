import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        // Executados contra o Supabase e o Redis configurados no .env.
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
