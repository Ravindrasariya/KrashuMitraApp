import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { maybeInjectListingMeta } from "./share-meta";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // index: false ensures `/` and `/<route>/` requests are NOT auto-served
  // as the raw index.html — they fall through to our catch-all below so
  // share-meta can inject absolute OG tags for crawlers (WhatsApp, etc.).
  app.use(express.static(distPath, { index: false }));

  // fall through to index.html for SPA routes; injects share-meta for HTML
  app.use("/{*path}", async (req, res) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf-8");
      html = await maybeInjectListingMeta(req, html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
