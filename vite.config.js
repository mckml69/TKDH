import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // Vitest's default file glob would otherwise also pick up server/index.test.js —
    // it's a separate npm package with its own node_modules/test script (see
    // server/package.json), so a plain `npm install` at the repo root has no reason
    // to have installed what it needs (supertest, etc).
    exclude: ["**/node_modules/**", "server/**"],
  },
});
