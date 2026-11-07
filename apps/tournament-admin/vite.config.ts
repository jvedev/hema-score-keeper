import { defineConfig } from "vite";
import { appBase } from "../../deployment/vite-app-base.mjs";

export default defineConfig({
  base: appBase("tournament-admin"),
  optimizeDeps: {
    exclude: ["@hema/ui"],
  },
  server: {
    host: true,
  },
});
