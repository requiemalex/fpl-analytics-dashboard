export {};

declare global {
  interface Window {
    // Only present when running inside the Electron desktop app (see
    // electron/preload.js) — undefined in a plain browser tab.
    electronWindow?: {
      minimize: () => void;
      close: () => void;
    };
  }
}
