import { defineConfig } from "vite";

export default defineConfig({
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
