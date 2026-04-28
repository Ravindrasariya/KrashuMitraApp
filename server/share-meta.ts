import type { MarketplaceListing } from "@shared/schema";
import { storage } from "./storage";

const CACHE_TTL_MS = 30_000;

interface ListingCacheEntry {
  listing: MarketplaceListing | null;
  photoCount: number;
  expires: number;
}

const cache = new Map<number, ListingCacheEntry>();

async function getListingCached(id: number) {
  const now = Date.now();
  const cached = cache.get(id);
  if (cached && cached.expires > now) return cached;
  const listing = (await storage.getMarketplaceListing(id)) ?? null;
  let photoCount = 0;
  if (listing) {
    try {
      photoCount = await storage.getListingPhotoCount(id);
    } catch {
      photoCount = 0;
    }
  }
  const entry: ListingCacheEntry = { listing, photoCount, expires: now + CACHE_TTL_MS };
  cache.set(id, entry);
  return entry;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    onion_seedling: "Onion Seedlings (प्याज पौध)",
    potato_seed: "Potato Seed (आलू बीज)",
    onion_seed: "Onion Seeds (प्याज बीज)",
    soyabean_seed: "Soyabean Seeds (सोयाबीन बीज)",
    bardan_bag: "Bardan Bag (बारदान)",
    exhaust_fan: "Exhaust Fan (एग्जॉस्ट फैन)",
  };
  return map[category] || "Listing";
}

const BRAND_TITLE = "KrashuVed | कृषुवेद — किसानों का साथी";
const BRAND_DESCRIPTION =
  "KrashuVed — कृषुवेद · किसानों का साथी. Marketplace, crop cards & digital clinic for Indian farmers.";
const SHARE_COVER_PATH = "/share-cover.png";
const SHARE_COVER_WIDTH = 1200;
const SHARE_COVER_HEIGHT = 630;

/**
 * Per-category extraction of the raw "interesting" facts from a listing,
 * shared between the OG description (English-mixed) and the per-listing
 * share-image card (Hindi). Centralizing this here so adding a new
 * category field only needs to be done in one place.
 */
export type ListingDetailFact =
  | { kind: "price"; amount: number; per: "kg" | "quintal" | "bag" | "piece" }
  | { kind: "qtyBigha"; bigha: string }
  | { kind: "qtyBags"; bags: string }
  | { kind: "availableInDays"; days: number }
  | { kind: "onionType"; value: string }
  | { kind: "potatoVariety"; value: string }
  | { kind: "potatoBrand"; value: string }
  | { kind: "onionSeedType"; value: string }
  | { kind: "onionSeedVariety"; value: string }
  | { kind: "onionSeedBrand"; value: string }
  | { kind: "soyabeanDuration"; value: string }
  | { kind: "soyabeanVariety"; value: string }
  | { kind: "bagMaterial"; value: string }
  | { kind: "bagDimension"; value: string }
  | { kind: "fanBrand"; value: string; other: string | null }
  | { kind: "fanWattage"; watts: number };

export function extractListingDetailFacts(l: MarketplaceListing): ListingDetailFact[] {
  const facts: ListingDetailFact[] = [];
  switch (l.category) {
    case "onion_seedling":
      if (l.quantityBigha) facts.push({ kind: "qtyBigha", bigha: l.quantityBigha });
      if (l.availableAfterDays != null) facts.push({ kind: "availableInDays", days: l.availableAfterDays });
      if (l.onionType) facts.push({ kind: "onionType", value: l.onionType });
      break;
    case "potato_seed":
      if (l.quantityBags) facts.push({ kind: "qtyBags", bags: l.quantityBags });
      if (l.potatoVariety) facts.push({ kind: "potatoVariety", value: l.potatoVariety });
      if (l.potatoBrand) facts.push({ kind: "potatoBrand", value: l.potatoBrand });
      break;
    case "onion_seed":
      if (l.onionSeedPricePerKg != null) facts.push({ kind: "price", amount: l.onionSeedPricePerKg, per: "kg" });
      if (l.onionSeedType) facts.push({ kind: "onionSeedType", value: l.onionSeedType });
      if (l.onionSeedVariety) facts.push({ kind: "onionSeedVariety", value: l.onionSeedVariety });
      if (l.onionSeedBrand) facts.push({ kind: "onionSeedBrand", value: l.onionSeedBrand });
      break;
    case "soyabean_seed":
      if (l.soyabeanSeedPricePerQuintal != null) facts.push({ kind: "price", amount: l.soyabeanSeedPricePerQuintal, per: "quintal" });
      if (l.soyabeanSeedDuration) facts.push({ kind: "soyabeanDuration", value: l.soyabeanSeedDuration });
      if (l.soyabeanSeedVariety) facts.push({ kind: "soyabeanVariety", value: l.soyabeanSeedVariety });
      break;
    case "bardan_bag":
      if (l.bagPricePerBag != null) facts.push({ kind: "price", amount: l.bagPricePerBag, per: "bag" });
      if (l.bagMaterialType) facts.push({ kind: "bagMaterial", value: l.bagMaterialType });
      if (l.bagDimension) facts.push({ kind: "bagDimension", value: l.bagDimension });
      break;
    case "exhaust_fan":
      if (l.fanPricePerPiece != null) facts.push({ kind: "price", amount: l.fanPricePerPiece, per: "piece" });
      if (l.fanBrand) facts.push({ kind: "fanBrand", value: l.fanBrand, other: l.fanBrandOther ?? null });
      if (l.fanWattage != null) facts.push({ kind: "fanWattage", watts: l.fanWattage });
      break;
  }
  return facts;
}

function factToEnglishLabel(f: ListingDetailFact): string {
  switch (f.kind) {
    case "price": {
      const per = f.per === "kg" ? "kg" : f.per === "quintal" ? "quintal" : f.per === "bag" ? "bag" : "piece";
      return `₹${f.amount}/${per}`;
    }
    case "qtyBigha": return `${f.bigha} bigha`;
    case "qtyBags": return `${f.bags} bags`;
    case "availableInDays": return `available in ${f.days} days`;
    case "onionType":
    case "potatoVariety":
    case "potatoBrand":
    case "onionSeedType":
    case "onionSeedVariety":
    case "onionSeedBrand":
    case "soyabeanVariety":
    case "bagMaterial":
    case "bagDimension":
      return f.value;
    case "soyabeanDuration": return `${f.value} duration`;
    case "fanBrand": return f.value === "Other" ? (f.other || "Other") : f.value;
    case "fanWattage": return `${f.watts}W`;
  }
}

function summarizeListing(listing: MarketplaceListing): { title: string; description: string } {
  const cat = categoryLabel(listing.category);
  const location = [listing.sellerVillage, listing.sellerDistrict].filter(Boolean).join(", ");
  const parts = extractListingDetailFacts(listing).map(factToEnglishLabel).filter(Boolean);
  const detail = parts.join(" · ");
  const summary = [cat, detail, location ? `📍 ${location}` : ""].filter(Boolean).join(" — ");
  // Task #79: append the seller's freehand 50-char note when present so it
  // surfaces in WhatsApp / Facebook / Twitter link-preview descriptions
  // (which is where the seller is likely sharing the listing). Cap defended
  // by Zod (.max(50)) on insert/update; we still use the raw value here so
  // any historical data stays unchanged.
  const notes = listing.additionalNotes?.trim();
  const withNotes = notes ? `${summary || cat} — ${notes}` : summary;
  const description = withNotes || BRAND_DESCRIPTION;
  return { title: BRAND_TITLE, description };
}

interface MetaPayload {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  imageMime?: string;
  type: "website" | "product";
  cardType: "summary" | "summary_large_image";
}

function injectMeta(html: string, meta: MetaPayload): string {
  const safeTitle = escapeHtml(meta.title);
  const safeDesc = escapeHtml(meta.description);
  const safeUrl = escapeHtml(meta.url);
  const safeImage = escapeHtml(meta.imageUrl);

  let out = html;
  out = out.replace(
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${safeDesc}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${safeTitle}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${safeDesc}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:image"[^>]*>/i,
    `<meta property="og:image" content="${safeImage}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:image"[^>]*>/i,
    `<meta name="twitter:image" content="${safeImage}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:card"[^>]*>/i,
    `<meta name="twitter:card" content="${meta.cardType}" />`,
  );

  const additions: string[] = [
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:site_name" content="KrashuVed" />`,
    `<meta property="og:image:secure_url" content="${safeImage}" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
  ];
  if (meta.imageWidth && meta.imageHeight) {
    additions.push(
      `<meta property="og:image:width" content="${meta.imageWidth}" />`,
      `<meta property="og:image:height" content="${meta.imageHeight}" />`,
      `<meta property="og:image:type" content="${meta.imageMime || "image/png"}" />`,
    );
  }
  const additionsHtml = additions.join("\n    ");

  if (out.match(/<meta\s+name="twitter:image"[^>]*>/i)) {
    out = out.replace(
      /<meta\s+name="twitter:image"[^>]*>/i,
      (m) => `${additionsHtml}\n    ${m}`,
    );
  } else {
    out = out.replace(/<\/head>/i, `    ${additionsHtml}\n  </head>`);
  }

  return out;
}

interface MetaRequestLike {
  method: string;
  originalUrl: string;
  protocol: string;
  get(name: string): string | undefined;
}

const CANONICAL_ORIGIN = "https://km.krashuved.com";

function canonicalShareOrigin(): string {
  const envBase = process.env.PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  return CANONICAL_ORIGIN;
}

function resolveOrigin(req: MetaRequestLike): string {
  const envBase = process.env.PUBLIC_BASE_URL?.trim();
  if (envBase) {
    return envBase.replace(/\/+$/, "");
  }
  const allowedHosts = (process.env.SHARE_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const rawHost = (req.get("host") || "").toLowerCase();
  const host = rawHost.split(",")[0]?.trim() || "";
  if (allowedHosts.length > 0) {
    return allowedHosts.includes(host) ? `${req.protocol}://${host}` : CANONICAL_ORIGIN;
  }
  return CANONICAL_ORIGIN;
}

/**
 * Fire-and-forget POST to Meta's Sharing-Debugger Graph endpoint to flush the
 * preview cache for a given URL. WhatsApp / Facebook keep cached previews for
 * ~7 days and won't re-fetch on their own; pinging this endpoint after a
 * listing is created, edited, or deactivated forces them to re-scrape, so
 * any *already-shared* WhatsApp message linking to that URL starts showing
 * the up-to-date preview within seconds — no manual debugger work needed.
 *
 * Best-effort: failures are swallowed and logged at warn level. Never await
 * this from a request handler; never let it block the seller's edit.
 */
export function pingMetaScrape(url: string): void {
  if (process.env.NODE_ENV === "test") return;
  const endpoint = `https://graph.facebook.com/?id=${encodeURIComponent(url)}&scrape=true`;
  // Node 18+ has a global fetch; we don't await — fire-and-forget.
  void fetch(endpoint, { method: "POST" })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(
          `[share-meta] Meta scrape ping returned ${res.status} for ${url}: ${body.slice(0, 200)}`,
        );
      }
    })
    .catch((err) => {
      console.warn(`[share-meta] Meta scrape ping failed for ${url}:`, err?.message || err);
    });
}

/**
 * Ping Meta's scrape endpoint for a listing's canonical share URL so any
 * already-shared WhatsApp / Facebook messages start showing the up-to-date
 * preview card within seconds. Fire-and-forget; failures are swallowed.
 *
 * The second `_shareVersion` parameter is intentionally ignored — kept only
 * so existing call sites compile unchanged. See Task #76 in `replit.md`:
 * client share URLs no longer carry a `&v=<token>` cache-bust query param,
 * so there's no second versioned URL to ping. Old shares already in
 * WhatsApp threads with `&v=...` are still rendered correctly because the
 * server-side OG injector (`maybeInjectListingMeta` + `buildListingMeta`)
 * still parses and echoes `v` defensively.
 */
export function pingListingShareCache(listingId: number, _shareVersion?: string | null): void {
  const origin = canonicalShareOrigin();
  pingMetaScrape(`${origin}/marketplace?listing=${listingId}`);
}

function buildBrandMeta(origin: string, pathPart: string): MetaPayload {
  return {
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    url: `${origin}${pathPart || "/"}`,
    imageUrl: `${origin}${SHARE_COVER_PATH}`,
    imageWidth: SHARE_COVER_WIDTH,
    imageHeight: SHARE_COVER_HEIGHT,
    type: "website",
    cardType: "summary_large_image",
  };
}

function buildListingMeta(
  origin: string,
  listing: MarketplaceListing,
  _hasPhoto: boolean,
  shareVersion?: string | null,
): MetaPayload {
  const { title, description } = summarizeListing(listing);
  // Echo the share-version token from the request URL into the canonical
  // og:url so WhatsApp / Facebook key their preview cache by *the exact URL
  // the seller actually shared*. Without this, the un-versioned canonical
  // collapses every versioned share into the same cache entry — defeating
  // the whole point of the per-listing cache-bust token.
  const base = `${origin}/marketplace?listing=${listing.id}`;
  const url = shareVersion ? `${base}&v=${shareVersion}` : base;
  return {
    title,
    description,
    url,
    imageUrl: `${origin}/api/marketplace/${listing.id}/share-image`,
    imageWidth: SHARE_COVER_WIDTH,
    imageHeight: SHARE_COVER_HEIGHT,
    imageMime: "image/jpeg",
    type: "product",
    cardType: "summary_large_image",
  };
}

export async function maybeInjectListingMeta(req: MetaRequestLike, html: string): Promise<string> {
  if (req.method !== "GET") return html;
  const original = req.originalUrl || "";
  const qIdx = original.indexOf("?");
  const pathPart = qIdx >= 0 ? original.slice(0, qIdx) : original;
  const queryPart = qIdx >= 0 ? original.slice(qIdx + 1) : "";
  const origin = resolveOrigin(req);

  // Listing-specific preview
  if (pathPart === "/marketplace" || pathPart === "/marketplace/") {
    const params = new URLSearchParams(queryPart);
    const raw = params.get("listing");
    const rawV = params.get("v");
    // Defensive sanitization: the legitimate share-version token shape is
    // `<base36>-<12-char-hex>`. Reject anything else before echoing it into
    // the canonical og:url so we can't be tricked into emitting attacker-
    // controlled query strings to crawlers.
    const safeV = rawV && /^[A-Za-z0-9_-]{1,64}$/.test(rawV) ? rawV : null;
    const listingId = parseInt(String(raw ?? ""), 10);
    if (listingId && !Number.isNaN(listingId)) {
      try {
        const { listing, photoCount } = await getListingCached(listingId);
        if (listing && listing.isActive) {
          const hasPhoto = photoCount > 0 || !!listing.photoMime;
          return injectMeta(html, buildListingMeta(origin, listing, hasPhoto, safeV));
        }
      } catch (err) {
        console.error("[share-meta] failed to inject listing meta:", err);
      }
    }
  }

  // Generic brand-led preview for homepage and any other route that crawlers hit
  return injectMeta(html, buildBrandMeta(origin, pathPart));
}
