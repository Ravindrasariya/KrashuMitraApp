import sharp from "sharp";
import fs from "node:fs";
import fsp from "node:fs/promises";
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

// Photo signature inputs the share version needs. Splitting this out so the
// list endpoint can compute share-version without loading the (huge) base64
// photo blobs every photo row carries — only photo ids are needed for the
// signature in the modern photos table case.
export interface PhotoSigInput {
  photoIds: number[];
  // Hash of the legacy inline photo blob (`listing.photoData`) when the
  // modern photos table is empty. Pass undefined / empty string otherwise.
  legacyPhotoSig?: string;
}

function buildContentSigHash(listing: MarketplaceListing, photoSig: PhotoSigInput): string {
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
    ost: listing.onionSeedType,
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
    ph: photoSig.photoIds.join(","),
    lph: photoSig.legacyPhotoSig ?? "",
  });
  return crypto.createHash("sha1").update(summarySig).digest("hex").slice(0, 12);
}

// Compact, URL-safe per-listing version token. Encodes createdAt + a hash
// of all share-card-relevant content fields + photo ids (so adding,
// removing, or replacing a photo all bust the token even when the count
// stays the same). This is what the marketplace API attaches to each
// listing as `shareVersion`, and what the client puts in `&v=...` on
// share URLs so WhatsApp / Facebook re-scrape after every edit.
export function computeShareVersion(listing: MarketplaceListing, photoSig: PhotoSigInput): string {
  const createdAtMs = listing.createdAt ? new Date(listing.createdAt as unknown as string).getTime() : 0;
  return `${createdAtMs.toString(36)}-${buildContentSigHash(listing, photoSig)}`;
}

// Helper used by the share-image route. Identical signature material to
// computeShareVersion; the W/" wrapper is the only HTTP-specific bit.
function legacyPhotoSigFor(listing: MarketplaceListing, photos: MarketplacePhoto[]): string {
  return photos.length === 0 && listing.photoData
    ? crypto.createHash("sha1").update(listing.photoData).digest("hex").slice(0, 12)
    : "";
}

function buildEtag(listing: MarketplaceListing, photos: MarketplacePhoto[]): string {
  const sig: PhotoSigInput = {
    photoIds: photos.map((p) => p.id),
    legacyPhotoSig: legacyPhotoSigFor(listing, photos),
  };
  const createdAtMs = listing.createdAt ? new Date(listing.createdAt as unknown as string).getTime() : 0;
  return `W/"l${listing.id}-${createdAtMs}-${buildContentSigHash(listing, sig)}"`;
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

// Persistent on-disk cache for composed share-images. Survives across
// restarts, so WhatsApp / Facebook bots scraping a freshly-versioned URL
// hit a static byte stream instead of paying ~250 ms of cold sharp work
// on the request path. Files are content-addressed by the strong ETag
// key (`l<id>-<createdAtMs>-<sigHash>.jpg`), so a stale file can never
// be served — any content change produces a new key.
function resolveShareImageCacheDir(): string {
  const env = process.env.SHARE_IMAGE_CACHE_DIR?.trim();
  if (env) return path.resolve(env);
  // Sibling of the module's parent dir.
  // - Dev (tsx): server/.. → repo root → <repo>/.share-image-cache
  // - Prod (CJS): dist/..  → install root → <install>/.share-image-cache
  return path.resolve(moduleDir(), "..", ".share-image-cache");
}

let cacheDirReady = false;
let cacheDirPath: string | null = null;
function ensureCacheDir(): string | null {
  if (cacheDirReady && cacheDirPath) return cacheDirPath;
  const dir = resolveShareImageCacheDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    cacheDirReady = true;
    cacheDirPath = dir;
    return dir;
  } catch (err) {
    console.warn("[share-image] failed to mkdir persistent cache dir:", err);
    return null;
  }
}

function etagToFileKey(etag: string): string | null {
  // ETag shape from buildEtag: `W/"l<id>-<createdAtMs>-<sigHash>"`. Pull the
  // strong key. Defensive: if shape is unexpected, refuse to touch disk.
  const m = etag.match(/^W\/"([A-Za-z0-9_\-]+)"$/);
  return m ? m[1] : null;
}

async function readPersistedBuffer(etag: string): Promise<Buffer | null> {
  if (process.env.NODE_ENV === "test") return null;
  const key = etagToFileKey(etag);
  if (!key) return null;
  const dir = ensureCacheDir();
  if (!dir) return null;
  try {
    return await fsp.readFile(path.join(dir, `${key}.jpg`));
  } catch {
    return null;
  }
}

// Atomic write via tmp + rename so concurrent reads never see a partial
// file. Cleans up other persisted versions for the same listing — when a
// seller edits, the old `l<id>-<oldCreatedAt>-<oldSig>.jpg` is removed
// after the new one lands. Best-effort throughout: any error is logged and
// swallowed (the in-memory LRU still holds the fresh buffer).
async function writePersistedBuffer(
  etag: string,
  listingId: number,
  buffer: Buffer,
): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const key = etagToFileKey(etag);
  if (!key) return;
  const dir = ensureCacheDir();
  if (!dir) return;
  const finalPath = path.join(dir, `${key}.jpg`);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tmpPath, buffer);
    await fsp.rename(tmpPath, finalPath);
  } catch (err) {
    console.warn("[share-image] persistent cache write failed:", err);
    try { await fsp.unlink(tmpPath); } catch {}
    return;
  }
  // Best-effort cleanup of stale per-listing entries. Match on `l<id>-`
  // prefix so we only touch this listing's files.
  try {
    const prefix = `l${listingId}-`;
    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      if (
        name.startsWith(prefix) &&
        name.endsWith(".jpg") &&
        name !== `${key}.jpg`
      ) {
        try { await fsp.unlink(path.join(dir, name)); } catch {}
      }
    }
  } catch {}
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

// Per-ETag single-flight: when N concurrent requests for the same versioned
// share-image arrive (e.g., WhatsApp's bot + the on-create prewarm + the
// seller's share-button prewarm + a debugger refresh), only one sharp job
// runs and the rest await its result. Without this, a cold burst would
// trigger N parallel ~250 ms renders, spiking CPU and tail latency.
const inFlightCompose = new Map<string, Promise<ShareImageResult>>();

export async function composeListingShareImage(meta: ShareImageMeta): Promise<ShareImageResult> {
  const { listing, photos, etag } = meta;
  const cached = cacheGet(etag);
  if (cached) {
    return { buffer: cached, etag, contentType: "image/jpeg" };
  }
  // Persistent disk cache: survives restarts so WhatsApp's first scrape of
  // a freshly-versioned URL is a static-disk read instead of cold sharp work.
  const persisted = await readPersistedBuffer(etag);
  if (persisted) {
    cacheSet(etag, persisted);
    return { buffer: persisted, etag, contentType: "image/jpeg" };
  }
  // Single-flight: if another caller is already composing this exact ETag,
  // share its work instead of starting a duplicate render.
  const existing = inFlightCompose.get(etag);
  if (existing) return existing;
  const job = composeListingShareImageInner(meta);
  inFlightCompose.set(etag, job);
  try {
    return await job;
  } finally {
    inFlightCompose.delete(etag);
  }
}

async function composeListingShareImageInner(meta: ShareImageMeta): Promise<ShareImageResult> {
  const { listing, photos, etag } = meta;
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
    // mozjpeg + lower quality together cut the composed preview from
    // ~145 KB at q=86 down to ~60–80 KB with no visible degradation at
    // WhatsApp / Facebook preview thumbnail size. This only affects the
    // share-preview JPEG returned by /api/marketplace/:id/share-image —
    // the listing's actual photos in the DB are byte-identical and the
    // marketplace UI keeps reading them at full quality.
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer();

  cacheSet(etag, buffer);
  // Await the persistent write so callers (e.g., precomposeListingShareImage
  // → routes.ts create/edit handlers chaining the Meta ping) only see the
  // promise resolve once disk is warm. Without this await, Meta could fire
  // its scrape before the file lands and still hit a cold path on its first
  // hit. The write itself is small (~45 KB) and atomic (tmp + rename), so
  // the added latency is bounded (~1-5 ms typical) and stays off the
  // request's critical path because the route handler doesn't await it.
  await writePersistedBuffer(etag, listing.id, buffer);
  return { buffer, etag, contentType: "image/jpeg" };
}

/**
 * Per-listing single-flight for the prewarm path. The public prewarm
 * endpoint is unauthenticated (it has to be — same as the GET share-image
 * endpoint that crawlers hit), so a flood of POSTs for the same listing
 * could otherwise queue up parallel meta-lookups + sharp jobs. Collapsing
 * by listingId means at most one prewarm runs per listing at a time;
 * subsequent calls reuse the in-flight promise. Combined with the in-memory
 * + disk caches checked inside composeListingShareImage, a flood across
 * different shareVersions of the same listing also stays bounded.
 */
const inFlightPrecompose = new Map<number, Promise<void>>();

/**
 * Pre-compose and persist a listing's share-image. Used by the create / edit
 * route handlers and the client's "share button clicked" pre-warm endpoint
 * so WhatsApp's bot — which scrapes the URL a few seconds after the user
 * actually shares — finds the composed JPEG already on disk and returns it
 * immediately instead of triggering a cold render on its first hit.
 *
 * Returns a promise that resolves once the share-image is in cache (in-memory
 * and on-disk). Caller may await it to ensure subsequent dependent work
 * (e.g., pinging Meta to re-scrape) lands against a warm cache. Failures are
 * swallowed and logged — never throws.
 */
export function precomposeListingShareImage(listingId: number): Promise<void> {
  const existing = inFlightPrecompose.get(listingId);
  if (existing) return existing;
  const job = (async () => {
    try {
      const meta = await getListingShareImageMeta(listingId);
      if (!meta) return;
      // composeListingShareImage handles in-memory + on-disk caching as a
      // side effect; calling it here is enough to warm both layers.
      await composeListingShareImage(meta);
    } catch (err) {
      console.warn(`[share-image] precompose failed for listing ${listingId}:`, err);
    } finally {
      inFlightPrecompose.delete(listingId);
    }
  })();
  inFlightPrecompose.set(listingId, job);
  return job;
}
