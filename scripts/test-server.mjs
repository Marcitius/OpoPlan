// Static server used only by Playwright; production uses Cloudflare Pages.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
createServer((req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  const candidate = resolve(root, "." + path);
  if (!candidate.startsWith(root + "/") && candidate !== root) {
    res.writeHead(403);
    res.end();
    return;
  }
  const file =
    existsSync(candidate) && extname(candidate)
      ? candidate
      : resolve(root, "index.html");
  res.setHeader(
    "Content-Type",
    types[extname(file)] ?? "application/octet-stream",
  );
  res.setHeader("Cache-Control", "no-cache");
  res.end(readFileSync(file));
}).listen(4180, "127.0.0.1", () =>
  console.log("Playwright static server ready"),
);
