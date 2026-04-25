import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { storage } from "./storage";
import type { MarketplaceListing, MarketplacePhoto } from "@shared/schema";
import { extractListingDetailFacts, type ListingDetailFact } from "./share-meta";

const W = 1200;
const H = 630;
const PHOTO_H = 441;
const BAND_H = H - PHOTO_H;

// Resolve the directory this module lives in for both runtime modes:
// - tsx (dev): file is at server/share-image.ts; import.meta.dirname works.
// - esbuild CJS bundle (prod): bundled into dist/index.cjs; __dirname is dist/.
// We must prefer __dirname when available — import.meta.dirname is undefined
// in the CJS bundle, and reading it at module top-level crashes the process.
declare const __dirname: string | undefined;
function moduleDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return import.meta.dirname;
}

// In dev: <repo>/server/assets/fonts/...
// In prod: <install>/dist/assets/fonts/... (build script copies server/assets → dist/assets)
function resolveFontPath(): string {
  return path.resolve(moduleDir(), "assets/fonts/NotoSansDevanagari-Regular.ttf");
}

// In dev: <repo>/client/public/share-cover.png
// In prod: <install>/dist/public/share-cover.png (Vite emits it there)
function resolveShareCoverPath(): string {
  if (typeof __dirname !== "undefined") {
    return path.resolve(moduleDir(), "public/share-cover.png");
  }
  return path.resolve(moduleDir(), "../client/public/share-cover.png");
}

let fontReady = false;
let fontInFlight: Promise<void> | null = null;
async function ensureDevanagariFont(): Promise<void> {
  if (fontReady) return;
  if (fontInFlight) return fontInFlight;
  fontInFlight = (async () => {
    try {
      const fontSrc = resolveFontPath();
      if (!fs.existsSync(fontSrc)) {
        console.warn("[share-image] bundled Devanagari font missing at", fontSrc);
        return;
      }
      const homeFontDir = path.join(os.homedir(), ".fonts");
      fs.mkdirSync(homeFontDir, { recursive: true });
      const dest = path.join(homeFontDir, "NotoSansDevanagari-Regular.ttf");
      const srcSize = fs.statSync(fontSrc).size;
      if (!fs.existsSync(dest) || fs.statSync(dest).size !== srcSize) {
        fs.copyFileSync(fontSrc, dest);
      }
      try {
        execSync("fc-cache -f", { stdio: "ignore" });
      } catch {
      }
      fontReady = true;
    } catch (err) {
      console.error("[share-image] font setup failed:", err);
    } finally {
      fontInFlight = null;
    }
  })();
  return fontInFlight;
}

const CATEGORY_BADGE: Record<string, string> = {
  onion_seedling: "प्याज रोप",
  potato_seed: "आलू बीज",
  onion_seed: "प्याज बीज",
  soyabean_seed: "सोयाबीन बीज",
  bardan_bag: "बारदान/बैग",
  exhaust_fan: "एग्जॉस्ट पंखा",
};

const CATEGORY_BADGE_COLOR: Record<string, { fill: string; text: string }> = {
  onion_seedling: { fill: "#dcfce7", text: "#166534" },
  potato_seed: { fill: "#fef3c7", text: "#92400e" },
  onion_seed: { fill: "#ffe4e6", text: "#9f1239" },
  soyabean_seed: { fill: "#ede9fe", text: "#5b21b6" },
  bardan_bag: { fill: "#e0f2fe", text: "#075985" },
  exhaust_fan: { fill: "#e2e8f0", text: "#1e293b" },
};

const SOYABEAN_DURATION_LABEL: Record<string, string> = { Long: "लंबी अवधि", Short: "छोटी अवधि" };
const BAG_MATERIAL_LABEL: Record<string, string> = {
  "Jute/Hessian": "जूट / हेसियन",
  "LENO Mesh": "लीनो जाली",
  PP: "पीपी",
  Others: "अन्य",
};
const FAN_BRAND_LABEL: Record<string, string> = {
  Crompton: "क्रॉम्पटन",
  Havells: "हैवेल्स",
  Usha: "उषा",
  Others: "अन्य",
};
const CONTACT_FOR_PRICE = "मूल्य के लिए संपर्क करें";

const PRICE_PER_HINDI: Record<"kg" | "quintal" | "bag" | "piece", string> = {
  kg: "किलो",
  quintal: "क्विंटल",
  bag: "बोरी",
  piece: "पीस",
};

function factToHindiLabel(f: ListingDetailFact): string {
  switch (f.kind) {
    case "price": return `₹${f.amount}/${PRICE_PER_HINDI[f.per]}`;
    case "qtyBigha": return `${f.bigha} बीघा`;
    case "qtyBags": return `${f.bags} बोरी`;
    case "availableInDays": return `${f.days} दिन में`;
    case "onionType":
    case "potatoVariety":
    case "potatoBrand":
    case "onionSeedType":
    case "onionSeedVariety":
    case "onionSeedBrand":
    case "soyabeanVariety":
    case "bagDimension":
      return f.value;
    case "soyabeanDuration": return SOYABEAN_DURATION_LABEL[f.value] || f.value;
    case "bagMaterial": return BAG_MATERIAL_LABEL[f.value] || f.value;
    case "fanBrand":
      return f.value === "Others" ? (f.other || "अन्य") : (FAN_BRAND_LABEL[f.value] || f.value);
    case "fanWattage": return `${f.watts}W`;
  }
}

function detailParts(l: MarketplaceListing): string[] {
  const facts = extractListingDetailFacts(l);
  const labels = facts.map(factToHindiLabel).filter(Boolean);
  // Pricing categories should always show a price line — fall back to "contact for price" when missing.
  const pricedCats = new Set(["onion_seed", "soyabean_seed", "bardan_bag", "exhaust_fan"]);
  const hasPrice = facts.some((f) => f.kind === "price");
  if (pricedCats.has(l.category) && !hasPrice) {
    labels.unshift(CONTACT_FOR_PRICE);
  }
  return labels;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

function buildEtag(listing: MarketplaceListing, photos: MarketplacePhoto[]): string {
  const createdAtMs = listing.createdAt ? new Date(listing.createdAt as unknown as string).getTime() : 0;
  const photoSig = photos.map((p) => p.id).join(",");
  // Legacy listings store the cover image inline as base64 in `photoData` (no
  // photo row). When the modern photos table is empty, fold a hash of that
  // legacy blob into the ETag so replacing the inline cover busts caches.
  const legacyPhotoSig = photos.length === 0 && listing.photoData
    ? crypto.createHash("sha1").update(listing.photoData).digest("hex").slice(0, 12)
    : "";
  const summarySig = JSON.stringify({
    c: listing.category,
    v: listing.sellerVillage,
    d: listing.sellerDistrict,
    p1: listing.onionSeedPricePerKg,
    p2: listing.soyabeanSeedPricePerQuintal,
    p3: listing.bagPricePerBag,
    p4: listing.fanPricePerPiece,
    qb: listing.quantityBigha,
    qg: listing.quantityBags,
    aad: listing.availableAfterDays,
    ot: listing.onionType,
    pv: listing.potatoVariety,
    pb: listing.potatoBrand,
    osv: listing.onionSeedVariety,
    osb: listing.onionSeedBrand,
    ssd: listing.soyabeanSeedDuration,
    ssv: listing.soyabeanSeedVariety,
    bmt: listing.bagMaterialType,
    bd: listing.bagDimension,
    fb: listing.fanBrand,
    fbo: listing.fanBrandOther,
    fw: listing.fanWattage,
    a: listing.isActive,
    ph: photoSig,
    lph: legacyPhotoSig,
  });
  const sigHash = crypto.createHash("sha1").update(summarySig).digest("hex").slice(0, 12);
  return `W/"l${listing.id}-${createdAtMs}-${sigHash}"`;
}

// Tiny in-memory LRU cache for composed image buffers. Keyed by the strong
// part of the ETag (which already encodes listing id + content signature),
// so a cache hit is byte-identical to a fresh render.
const IMAGE_CACHE_CAPACITY = 32;
const imageCache = new Map<string, Buffer>();
function cacheGet(key: string): Buffer | undefined {
  const v = imageCache.get(key);
  if (v) {
    imageCache.delete(key);
    imageCache.set(key, v);
  }
  return v;
}
function cacheSet(key: string, value: Buffer): void {
  if (imageCache.has(key)) imageCache.delete(key);
  imageCache.set(key, value);
  while (imageCache.size > IMAGE_CACHE_CAPACITY) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
}

export interface ShareImageMeta {
  etag: string;
  listing: MarketplaceListing;
  photos: MarketplacePhoto[];
}

export async function getListingShareImageMeta(listingId: number): Promise<ShareImageMeta | null> {
  const listing = await storage.getMarketplaceListing(listingId);
  if (!listing || !listing.isActive) return null;
  let photos: MarketplacePhoto[] = [];
  try {
    photos = await storage.getListingPhotos(listingId);
  } catch {
    photos = [];
  }
  return { etag: buildEtag(listing, photos), listing, photos };
}

export interface ShareImageResult {
  buffer: Buffer;
  etag: string;
  contentType: "image/jpeg";
}

async function buildTopLayer(
  listing: MarketplaceListing,
  photos: MarketplacePhoto[],
): Promise<Buffer> {
  const first = photos[0];
  let photoBuf: Buffer | null = null;
  if (first) {
    photoBuf = Buffer.from(first.photoData, "base64");
  } else if (listing.photoData) {
    photoBuf = Buffer.from(listing.photoData, "base64");
  }
  if (photoBuf) {
    try {
      return await sharp(photoBuf)
        .resize(W, PHOTO_H, { fit: "cover", position: "center" })
        .toBuffer();
    } catch (err) {
      console.warn("[share-image] failed to decode listing photo, falling back to cover:", err);
    }
  }
  const coverPath = resolveShareCoverPath();
  if (fs.existsSync(coverPath)) {
    try {
      return await sharp(coverPath)
        .resize(W, PHOTO_H, { fit: "cover", position: "center" })
        .toBuffer();
    } catch (err) {
      console.warn("[share-image] failed to load brand cover:", err);
    }
  }
  return await sharp({
    create: { width: W, height: PHOTO_H, channels: 4, background: { r: 240, g: 247, b: 230, alpha: 1 } },
  }).png().toBuffer();
}

export async function composeListingShareImage(meta: ShareImageMeta): Promise<ShareImageResult> {
  const { listing, photos, etag } = meta;
  const cached = cacheGet(etag);
  if (cached) {
    return { buffer: cached, etag, contentType: "image/jpeg" };
  }
  await ensureDevanagariFont();

  const topLayer = await buildTopLayer(listing, photos);

  const badge = CATEGORY_BADGE[listing.category] || "Listing";
  const badgeColor = CATEGORY_BADGE_COLOR[listing.category] || { fill: "#e0f2fe", text: "#075985" };
  const badgeWidth = Math.max(220, badge.length * 32 + 56);
  const badgeHeight = 56;

  const detailLine = detailParts(listing).join(" · ") || CONTACT_FOR_PRICE;
  const detail = truncate(detailLine, 60);

  const location = [listing.sellerVillage, listing.sellerDistrict].filter(Boolean).join(", ");
  const locationText = location ? truncate(location, 52) : "";

  const FONT = "Noto Sans Devanagari, DejaVu Sans, sans-serif";
  const bandY = PHOTO_H;
  const padX = 56;
  const badgeY = bandY + 24;
  const detailY = bandY + 116;
  const locationY = bandY + 162;
  const pinX = padX;
  const pinTopY = locationY - 28;
  const pinTextX = padX + 36;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="0" y="${bandY}" width="${W}" height="${BAND_H}" fill="#ffffff"/>
  <rect x="0" y="${bandY}" width="${W}" height="3" fill="#1f3d0a" opacity="0.18"/>
  <rect x="${padX}" y="${badgeY}" width="${badgeWidth}" height="${badgeHeight}" rx="28" ry="28" fill="${badgeColor.fill}"/>
  <text x="${padX + badgeWidth / 2}" y="${badgeY + 38}" font-family="${FONT}" font-size="30" font-weight="700" fill="${badgeColor.text}" text-anchor="middle">${escapeXml(badge)}</text>
  <text x="${padX}" y="${detailY}" font-family="${FONT}" font-size="32" font-weight="600" fill="#1f3d0a">${escapeXml(detail)}</text>
  ${locationText ? `<g transform="translate(${pinX}, ${pinTopY})" fill="#1f3d0a"><path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 24 14 24s14-13.5 14-24C28 6.27 21.73 0 14 0zm0 19a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></g>
  <text x="${pinTextX}" y="${locationY}" font-family="${FONT}" font-size="28" font-weight="500" fill="#3a5a16">${escapeXml(locationText)}</text>` : ""}
  <text x="${W - padX}" y="${H - 28}" font-family="${FONT}" font-size="22" font-weight="600" fill="#5a7a26" text-anchor="end">km.krashuved.com</text>
</svg>`;

  const buffer = await sharp(topLayer)
    .extend({ top: 0, bottom: BAND_H, left: 0, right: 0, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 86, progressive: true, mozjpeg: false })
    .toBuffer();

  cacheSet(etag, buffer);
  return { buffer, etag, contentType: "image/jpeg" };
}
