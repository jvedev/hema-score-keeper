import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Never touch data/dev.db from tests.
    env: { DATABASE_URL: "file::memory:" },
  },
});
