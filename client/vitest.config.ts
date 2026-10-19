import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import rootPackage from "../package.json";

// Separate from vite.config.ts's dev-server proxy settings, which don't
// apply to the test run. Kept minimal: jsdom for the handful of tests that
// touch localStorage/React hooks, plain node-like behaviour otherwise.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(rootPackage.version) },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
