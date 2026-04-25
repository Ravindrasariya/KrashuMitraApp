/**
 * Builds the 1200x630 social share cover (og:image / twitter:image) at
 * client/public/share-cover.png.
 *
 * NOTE on language: the brand name is bilingual ("KrashuVed | कृषुवेद").
 * However the build container only has DejaVu Sans available, which does NOT
 * include Devanagari glyphs — rendering "कृषुवेद" with sharp+SVG here would
 * produce empty boxes. So this script intentionally renders an English-only
 * illustrative cover ("KrashuVed — Companion for Indian Farmers"). A proper
 * bilingual cover (with Noto Sans Devanagari) is tracked as a follow-up task
 * and can replace this PNG without any code changes — the file path stays
 * the same.
 */
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const logoPath = path.resolve(projectRoot, "client/public/logo.png");
const outPath = path.resolve(projectRoot, "client/public/share-cover.png");

const W = 1200;
const H = 630;
const LOGO_BOX = 360;

async function main() {
  const logoSquare = await sharp(logoPath)
    .resize(LOGO_BOX, LOGO_BOX, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  const logoB64 = logoSquare.toString("base64");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="${H - 90}" width="${W}" height="90" fill="#1f3d0a"/>

  <image x="80" y="${(H - 110 - LOGO_BOX) / 2}" width="${LOGO_BOX}" height="${LOGO_BOX}" xlink:href="data:image/png;base64,${logoB64}"/>

  <g font-family="DejaVu Sans, sans-serif" fill="#1f3d0a">
    <text x="500" y="270" font-size="100" font-weight="800" letter-spacing="2">KrashuVed</text>
    <line x1="500" y1="320" x2="1120" y2="320" stroke="#7b9a3a" stroke-width="3"/>
    <text x="500" y="380" font-size="40" font-weight="600" fill="#3a5a16">Companion for Indian Farmers</text>
    <text x="500" y="440" font-size="28" font-weight="400" fill="#5a7a26">Marketplace · Crop Cards · Digital Clinic</text>
  </g>

  <g font-family="DejaVu Sans, sans-serif" fill="#ffffff">
    <text x="80" y="${H - 32}" font-size="30" font-weight="600">km.krashuved.com</text>
  </g>
</svg>`;

  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  const stat = await fs.stat(outPath);
  console.log(`wrote ${outPath} ${meta.width}x${meta.height} ${stat.size} bytes ${meta.depth} ${meta.channels}ch`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
