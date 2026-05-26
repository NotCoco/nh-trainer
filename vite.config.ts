import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  publicDir: "fixtures",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (normalizedId.includes("/node_modules/three/")) {
            return "vendor-three";
          }

          if (normalizedId.includes("/node_modules/react")) {
            return "vendor-react";
          }
        }
      }
    }
  }
});
