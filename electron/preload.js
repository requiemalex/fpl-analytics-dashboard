const { contextBridge, ipcRenderer } = require("electron");

// Exposed as window.electronWindow — its presence is also how AppShell.tsx
// knows to render the custom minimize/close controls at all (a plain
// browser tab loading the same client build has no such global, and
// renders neither the buttons nor the reserved topbar space for them).
contextBridge.exposeInMainWorld("electronWindow", {
  minimize: () => ipcRenderer.send("window-minimize"),
  close: () => ipcRenderer.send("window-close"),
});
