import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [wasm()],

  // Root points to project root where index.html is
  root: ".",

  // Public directory for static assets
  publicDir: "static",

  // Build configuration
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022", // Required for top-level await in mupdf

    // Increase chunk size warning limit for WASM
    chunkSizeWarningLimit: 10000,
  },

  // Development server configuration
  server: {
    port: 8080,
    open: true,
    strictPort: true,
    fs: {
      // Allow serving files from project and Nix store for WASM
      allow: [".", "/nix/store"],
    },
  },

  // Preview server configuration (for testing prod build)
  preview: {
    port: 8080,
  },

  // Resolve configuration
  resolve: {
    extensions: [".ts", ".js", ".json"],
  },

  // Optimize dependencies
  optimizeDeps: {
    exclude: ["mupdf"],
  },
});
