import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative paths, and no separate image or style files, so the build can be put inside one page (scripts/inlinePage.mjs).
  base: "./",
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
