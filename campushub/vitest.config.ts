import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One test file at a time: Keycloak's brute-force protection (kept ON, it's a real defence)
    // flags the same user logging in from two test files at the same instant.
    fileParallelism: false,
  },
});
