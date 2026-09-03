import path from "node:path";
import { defineConfig } from "vitest/config";

const repositoryRoot = import.meta.dirname;

export default defineConfig({
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
