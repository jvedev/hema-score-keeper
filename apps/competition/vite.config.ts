import { defineConfig } from "vite";

export default defineConfig({
  base: "/hema-score-keeper/competition/",
  optimizeDeps: {
    exclude: ["@hema/ui"],
  },
  server: {
    host: true,
  },
});
