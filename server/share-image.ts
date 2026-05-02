import sharp from "sharp";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { storage } from "./storage";
import type { MarketplaceListing, MarketplacePhoto } from "@shared/schema";
// (Task #78) The composed share-image is now full-bleed: it's just the
// listing's first photo (or the brand cover as a fallback) cropped to
// 1200×630 with no overlay band, no badge, no location pill, no domain
// footer. Those facts are already shown by WhatsApp / Facebook below the
// picture as the link's title (og:title), description (og:description, via
// summarizeListing in server/share-meta.ts), and URL.

const W = 1200;
const H = 630;
// Task #78: full-bleed photo. The white card band that used to sit at the
// bottom (carrying the category badge, village/district pin, and domain
// footer) was removed entirely — Meta already renders the brand title,
// listing description, and URL directly below the picture in the link card.
const PHOTO_H = H;

declare const __dirname: string | undefined;

// In dev (tsx): npm run dev runs from <repo>/, cover at
//   <repo>/client/public/share-cover.png
// In prod (CJS bundle at <install>/dist/index.cjs): cover at
//   <install>/dist/public/share-cover.png (Vite emits it there).
function resolveShareCoverPath(): string {
  if (typeof __dirname !== "undefined") {
    return path.resolve(__dirname, "public/share-cover.png");
  }
  return path.resolve(process.cwd(), "client/public/share-cover.png");
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
    // Task #102: include MRP fields so OG descriptions ("MRP ₹X, NN% off")
    // bust the cached preview text whenever the seller changes the MRP.
    // Image pixels themselves don't render MRP today, but description does
    // and Meta caches both together against `og:image:secure_url`.
    mrp1: listing.onionSeedMrpPerKg,
    mrp2: listing.soyabeanSeedMrpPerQuintal,
    mrp3: listing.bagMrpPerBag,
    mrp4: listing.fanMrpPerPiece,
    omrp: listing.othersMrp,
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
    // Task #79: include the freehand notes in the cache key. Notes only
    // affect the og:description meta tag (not the rendered share image
    // pixels), but the description is part of the same Meta link-preview
    // record Facebook caches against `og:image:secure_url`. Bumping this
    // key when notes change keeps WhatsApp/Facebook from showing a stale
    // preview text alongside a freshly re-fetched image.
    an: listing.additionalNotes ?? "",
    // Task #84: include Others-category fields in the cache key so that
    // editing any of them invalidates both the persistent on-disk JPEG
    // and the Meta-side preview text. Only the fields that actually feed
    // og:title / og:description (via summarizeListing) are tracked.
    opn: listing.othersProductName ?? "",
    op: listing.othersPrice,
    ob: listing.othersBrand ?? "",
    oc: listing.othersCondition ?? "",
    a: listing.isActive,
    ph: photoSig.photoIds.join(","),
    lph: photoSig.legacyPhotoSig ?? "",
    // Layout version — bump whenever the composition changes so old
    // persistent cache files (and any Meta-side cached previews) are
    // invalidated. v3 = Task #78 (full-bleed photo, no white band).
    // v4 = Task #79 (notes appended to og:description; image unchanged).
    // Task #84 deliberately does NOT bump `lay` — the composed image
    // pixels are unchanged. Edits to Others fields still invalidate the
    // signature via the explicit `opn`/`op`/`ob`/`oc` entries above, so
    // the persistent cache key still flips per listing edit; only the
    // global layout token stays stable so unrelated listings keep their
    // existing cached JPEGs.
    // v5 = Task #102 (MRP appended to og:description as "MRP ₹X, NN%
    // off"; image unchanged). Bumped because the description format
    // itself changed for every listing that ever had a price, so even
    // pre-existing listings need a fresh Meta scrape.
    lay: 5,
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
  // Sibling of the install/repo root.
  // - Dev (tsx): cwd is <repo>           → <repo>/.share-image-cache
  // - Prod (CJS): __dirname is dist/     → <install>/.share-image-cache
  if (typeof __dirname !== "undefined") {
    return path.resolve(__dirname, "..", ".share-image-cache");
  }
  return path.resolve(process.cwd(), ".share-image-cache");
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

/**
 * Resolve the on-disk filesystem path where a persisted share-image for the
 * given ETag would live, or null if the ETag is malformed / cache dir is
 * unavailable. Used by the GET share-image route to stream the file directly
 * (createReadStream → pipe) on a disk-cache hit, avoiding loading the whole
 * JPEG into memory just to send it. Does NOT verify that the file exists —
 * the caller should fs.stat / fs.access first and fall back to compose on
 * failure.
 */
export function persistedShareImagePath(etag: string): string | null {
  if (process.env.NODE_ENV === "test") return null;
  const key = etagToFileKey(etag);
  if (!key) return null;
  const dir = ensureCacheDir();
  if (!dir) return null;
  return path.join(dir, `${key}.jpg`);
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

// Strip every persisted (and in-memory cached) share-image for a listing.
// Used by the DELETE /api/marketplace/:id route so that removing a listing
// also reclaims its on-disk preview file — without this, the cache dir
// grows monotonically as listings come and go. Best-effort: any I/O error
// is logged and swallowed so the deletion request itself never fails on
// account of stale-file cleanup.
export async function deletePersistedShareImagesForListing(
  listingId: number,
): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  // Drop in-memory LRU entries first — keys are the strong ETag
  // (`l<id>-<createdAtMs>-<sigHash>`), so a prefix match is exact.
  const memPrefix = `l${listingId}-`;
  for (const key of Array.from(imageCache.keys())) {
    if (key.startsWith(memPrefix)) imageCache.delete(key);
  }
  const dir = ensureCacheDir();
  if (!dir) return;
  try {
    const entries = await fsp.readdir(dir);
    const filePrefix = `l${listingId}-`;
    for (const name of entries) {
      if (name.startsWith(filePrefix) && name.endsWith(".jpg")) {
        try { await fsp.unlink(path.join(dir, name)); } catch {}
      }
    }
  } catch (err) {
    console.warn(
      `[share-image] failed to clean cache for deleted listing ${listingId}:`,
      err,
    );
  }
}

// Periodic sweep: walk every `l<id>-*.jpg` in the cache dir and unlink any
// whose listing id is no longer present in the database. Catches files that
// would otherwise be orphaned by past deletions (before this cleanup landed)
// or by edge cases like crashes between DB delete and cache cleanup.
//
// Returns the number of files removed. Best-effort: per-file errors are
// logged and skipped.
export async function sweepOrphanShareImages(): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0;
  const dir = ensureCacheDir();
  if (!dir) return 0;
  let aliveIds: number[];
  try {
    aliveIds = await storage.getAllMarketplaceListingIds();
  } catch (err) {
    console.warn("[share-image] sweep failed to read listing ids:", err);
    return 0;
  }
  const alive = new Set<number>(aliveIds);
  let removed = 0;
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch (err) {
    console.warn("[share-image] sweep failed to read cache dir:", err);
    return 0;
  }
  for (const name of entries) {
    if (!name.endsWith(".jpg")) continue;
    // Strong ETag shape: `l<id>-<createdAtMs>-<sigHash>.jpg`
    const m = name.match(/^l(\d+)-/);
    if (!m) continue;
    const id = Number(m[1]);
    if (!Number.isFinite(id) || alive.has(id)) continue;
    try {
      await fsp.unlink(path.join(dir, name));
      removed += 1;
      // Also drop any matching in-memory LRU entry.
      const memPrefix = `l${id}-`;
      for (const key of Array.from(imageCache.keys())) {
        if (key.startsWith(memPrefix)) imageCache.delete(key);
      }
    } catch (err) {
      console.warn(`[share-image] sweep failed to unlink ${name}:`, err);
    }
  }
  return removed;
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
  const { listing, etag } = meta;

  // Task #78: the composed image is now just the top layer (1200×630 photo
  // or brand-cover fallback) re-encoded to a tuned JPEG. No SVG overlay,
  // no white band, no Devanagari text — Meta renders the brand title and
  // listing description directly below the picture from og:title and
  // og:description, so duplicating them inside the picture is wasted space.
  const topLayer = await buildTopLayer(listing, meta.photos);

  const buffer = await sharp(topLayer)
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
