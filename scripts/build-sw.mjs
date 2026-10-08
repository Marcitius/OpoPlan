import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
const assets = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  ...readdirSync("dist/assets").map((f) => "/assets/" + f),
];
const hash = createHash("sha256")
  .update(readFileSync("dist/index.html"))
  .digest("hex")
  .slice(0, 12);
writeFileSync(
  "dist/sw.js",
  readFileSync("public/sw.js", "utf8")
    .replace(/^const CACHE\s*=\s*[^;]+;/m, 'const CACHE='+JSON.stringify("opoplan-shell-" + hash)+';')
    .replace(
      /^const ASSETS\s*=\s*\[[\s\S]*?\];/m,
      'const ASSETS='+JSON.stringify(assets)+';',
    ),
);
