import { defineConfig } from "vite";
import { appBase } from "../../deployment/vite-app-base.mjs";

export default defineConfig({
  base: appBase("competition-admin"),
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
