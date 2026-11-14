import path from "node:path";
import { defineConfig } from "vitest/config";
import { facilitiesPhotosPlugin } from "./client/scripts/facilities/plugin.mjs";

const repositoryRoot = import.meta.dirname;

export default defineConfig({
  plugins: [facilitiesPhotosPlugin()],
  root: path.resolve(repositoryRoot, "client"),
  resolve: {
    alias: {
      "@": path.resolve(repositoryRoot, "client", "src"),
      "@shared": path.resolve(repositoryRoot, "shared"),
      "@assets": path.resolve(repositoryRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
  },
});
