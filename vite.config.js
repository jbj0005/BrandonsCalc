// vite.config.js
import { defineConfig } from "vite";

const repoName = "BrandonsCalc";

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? `/${repoName}/` : "/",
  server: {
    port: 5173, // dev server port
    open: true, // auto-open browser on start
    host: true, // listen on 0.0.0.0 for LAN testing
  },
  preview: {
    port: 4173,
    open: true,
    host: true,
  },
});
