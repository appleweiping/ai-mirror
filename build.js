// ai-mirror build step (runs on Vercel).
//
// The frontend is fully static (public/) and the backend is edge functions in
// api/, so there's nothing to compile. We just sanity-check that the expected
// assets exist, then exit 0 so Vercel proceeds to publish public/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = [
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/themes.css",
  "public/i18n.js",
  "public/scene3d.js",
  "public/assets/ai-mirror-banner.png",
  "api/chat.js",
  "api/models.js",
  "api/_providers.js",
];

let ok = true;
for (const rel of required) {
  if (!fs.existsSync(path.join(__dirname, rel))) {
    console.error("[ai-mirror] MISSING:", rel);
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log("[ai-mirror] all assets present — static build ready.");
