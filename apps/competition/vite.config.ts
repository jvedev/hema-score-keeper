import { defineConfig } from "vite";

export default defineConfig({
  // Published at <origin>/hema-score-keeper/competition/; invite links are <base>join/<code>.
  base: "/hema-score-keeper/competition/",
  optimizeDeps: {
    exclude: ["@hema/ui"],
  },
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
