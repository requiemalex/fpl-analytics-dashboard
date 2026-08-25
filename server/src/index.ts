import { createApp } from "./app.js";
import { PORT } from "./config.js";

createApp().listen(PORT, () => {
  console.log(`FPL dashboard API proxy listening on http://localhost:${PORT}`);
});
