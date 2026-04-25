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
    potato: "Potato (आलू)",
    onion_seed: "Onion Seeds (प्याज बीज)",
    soyabean_seed: "Soyabean Seeds (सोयाबीन बीज)",
    bardan_bag: "Bardan Bag (बारदान)",
    exhaust_fan: "Exhaust Fan (एग्जॉस्ट फैन)",
  };
  return map[category] || "Listing";
}

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
    case "potato":
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
  const title = `${cat}${location ? ` in ${location}` : ""} | Krashu Mitra`;
  const description = [detail, location ? `📍 ${location}` : ""].filter(Boolean).join(" — ")
    || "Listed on Krashu Mitra — the smart companion for Indian farmers";
  return { title, description };
}

function injectListingMeta(
  html: string,
  listing: MarketplaceListing,
  hasPhoto: boolean,
  origin: string,
): string {
  const { title, description } = summarizeListing(listing);
  const url = `${origin}/marketplace?listing=${listing.id}`;
  const imageUrl = hasPhoto
    ? `${origin}/api/marketplace/${listing.id}/image?index=0`
    : `${origin}/logo.png`;

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeUrl = escapeHtml(url);
  const safeImage = escapeHtml(imageUrl);

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
    `<meta name="twitter:card" content="summary_large_image" />`,
  );

  const additions = [
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="Krashu Mitra" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
  ].join("\n    ");

  if (out.match(/<meta\s+name="twitter:image"[^>]*>/i)) {
    out = out.replace(
      /<meta\s+name="twitter:image"[^>]*>/i,
      (m) => `${additions}\n    ${m}`,
    );
  } else {
    out = out.replace(/<\/head>/i, `    ${additions}\n  </head>`);
  }

  return out;
}

interface MetaRequestLike {
  method: string;
  originalUrl: string;
  protocol: string;
  get(name: string): string | undefined;
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
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    return "https://km.krashuved.com";
  }
  if (!host) return "https://km.krashuved.com";
  return `${req.protocol}://${host}`;
}

export async function maybeInjectListingMeta(req: MetaRequestLike, html: string): Promise<string> {
  if (req.method !== "GET") return html;
  const original = req.originalUrl || "";
  const qIdx = original.indexOf("?");
  const pathPart = qIdx >= 0 ? original.slice(0, qIdx) : original;
  const queryPart = qIdx >= 0 ? original.slice(qIdx + 1) : "";
  if (pathPart !== "/marketplace" && pathPart !== "/marketplace/") return html;
  const params = new URLSearchParams(queryPart);
  const raw = params.get("listing");
  const listingId = parseInt(String(raw ?? ""), 10);
  if (!listingId || Number.isNaN(listingId)) return html;
  try {
    const { listing, photoCount } = await getListingCached(listingId);
    if (!listing || !listing.isActive) return html;
    const hasPhoto = photoCount > 0 || !!listing.photoMime;
    const origin = resolveOrigin(req);
    return injectListingMeta(html, listing, hasPhoto, origin);
  } catch (err) {
    console.error("[share-meta] failed to inject listing meta:", err);
    return html;
  }
}
