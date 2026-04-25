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

function summarizeListing(listing: MarketplaceListing): { title: string; description: string } {
  const cat = categoryLabel(listing.category);
  const location = [listing.sellerVillage, listing.sellerDistrict].filter(Boolean).join(", ");
  const parts: string[] = [];

  switch (listing.category) {
    case "onion_seedling":
      if (listing.quantityBigha) parts.push(`${listing.quantityBigha} bigha`);
      if (listing.availableAfterDays != null) parts.push(`available in ${listing.availableAfterDays} days`);
      if (listing.onionType) parts.push(listing.onionType);
      break;
    case "potato_seed":
      if (listing.quantityBags) parts.push(`${listing.quantityBags} bags`);
      if (listing.potatoVariety) parts.push(listing.potatoVariety);
      if (listing.potatoBrand) parts.push(listing.potatoBrand);
      break;
    case "onion_seed":
      if (listing.onionSeedPricePerKg != null) parts.push(`₹${listing.onionSeedPricePerKg}/kg`);
      if (listing.onionSeedType) parts.push(listing.onionSeedType);
      if (listing.onionSeedVariety) parts.push(listing.onionSeedVariety);
      if (listing.onionSeedBrand) parts.push(listing.onionSeedBrand);
      break;
    case "soyabean_seed":
      if (listing.soyabeanSeedPricePerQuintal != null) parts.push(`₹${listing.soyabeanSeedPricePerQuintal}/quintal`);
      if (listing.soyabeanSeedDuration) parts.push(`${listing.soyabeanSeedDuration} duration`);
      if (listing.soyabeanSeedVariety) parts.push(listing.soyabeanSeedVariety);
      break;
    case "bardan_bag":
      if (listing.bagPricePerBag != null) parts.push(`₹${listing.bagPricePerBag}/bag`);
      if (listing.bagMaterialType) parts.push(listing.bagMaterialType);
      if (listing.bagDimension) parts.push(listing.bagDimension);
      break;
    case "exhaust_fan":
      if (listing.fanPricePerPiece != null) parts.push(`₹${listing.fanPricePerPiece}/piece`);
      if (listing.fanBrand) {
        parts.push(listing.fanBrand === "Other" ? listing.fanBrandOther || "Other" : listing.fanBrand);
      }
      if (listing.fanWattage != null) parts.push(`${listing.fanWattage}W`);
      break;
  }

  const detail = parts.join(" · ");
  const summary = [cat, detail, location ? `📍 ${location}` : ""].filter(Boolean).join(" — ");
  const description = summary || BRAND_DESCRIPTION;
  return { title: BRAND_TITLE, description };
}

interface MetaPayload {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
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
      `<meta property="og:image:type" content="image/png" />`,
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
  hasPhoto: boolean,
): MetaPayload {
  const { title, description } = summarizeListing(listing);
  const url = `${origin}/marketplace?listing=${listing.id}`;
  if (hasPhoto) {
    return {
      title,
      description,
      url,
      imageUrl: `${origin}/api/marketplace/${listing.id}/image?index=0`,
      type: "product",
      cardType: "summary_large_image",
    };
  }
  return {
    title,
    description,
    url,
    imageUrl: `${origin}${SHARE_COVER_PATH}`,
    imageWidth: SHARE_COVER_WIDTH,
    imageHeight: SHARE_COVER_HEIGHT,
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
    const listingId = parseInt(String(raw ?? ""), 10);
    if (listingId && !Number.isNaN(listingId)) {
      try {
        const { listing, photoCount } = await getListingCached(listingId);
        if (listing && listing.isActive) {
          const hasPhoto = photoCount > 0 || !!listing.photoMime;
          return injectMeta(html, buildListingMeta(origin, listing, hasPhoto));
        }
      } catch (err) {
        console.error("[share-meta] failed to inject listing meta:", err);
      }
    }
  }

  // Generic brand-led preview for homepage and any other route that crawlers hit
  return injectMeta(html, buildBrandMeta(origin, pathPart));
}
