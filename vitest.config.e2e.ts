import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    // Everything that needs a container: `*.int-spec.ts` talks to the database or the broker
    // directly, `*.e2e-spec.ts` goes through HTTP. Plain `*.spec.ts` stays unit-only.
    include: ['**/*.int-spec.ts', '**/*.e2e-spec.ts'],
    globalSetup: ['./test/setup/global.setup.ts'],
    setupFiles: ['./test/setup/environment.setup.ts'],
    // One database for the whole run, so files must not truncate each other's rows.
    fileParallelism: false,
    // A broker-level file joins several consumer groups in `beforeAll`, which the default 10s
    // hook timeout fails; and a 5s test cannot reach `waitUntil`'s own 15s deadline.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
