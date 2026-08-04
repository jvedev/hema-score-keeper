import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@hema/ui"],
  },
  server: {
    host: true,
  },
});
