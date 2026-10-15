import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    server: { deps: { inline: ["@material/material-color-utilities"] } },
  },
});
