import type { MarketplaceListing } from "./schema";
import { formatRupeeAmount } from "./price-format";

export type ListingDetailFact =
  | { kind: "price"; amount: number; per: "kg" | "quintal" | "bag" | "piece" | "item"; marketAmount?: number | null }
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
  | { kind: "fanWattage"; watts: number }
  | { kind: "othersProductName"; value: string }
  | { kind: "othersBrand"; value: string }
  | { kind: "othersCondition"; value: string };

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
      if (l.onionSeedPricePerKg != null) facts.push({ kind: "price", amount: l.onionSeedPricePerKg, per: "kg", marketAmount: l.onionSeedMrpPerKg ?? null });
      if (l.onionSeedType) facts.push({ kind: "onionSeedType", value: l.onionSeedType });
      if (l.onionSeedVariety) facts.push({ kind: "onionSeedVariety", value: l.onionSeedVariety });
      if (l.onionSeedBrand) facts.push({ kind: "onionSeedBrand", value: l.onionSeedBrand });
      break;
    case "soyabean_seed":
      if (l.soyabeanSeedPricePerQuintal != null) facts.push({ kind: "price", amount: l.soyabeanSeedPricePerQuintal, per: "quintal", marketAmount: l.soyabeanSeedMrpPerQuintal ?? null });
      if (l.soyabeanSeedDuration) facts.push({ kind: "soyabeanDuration", value: l.soyabeanSeedDuration });
      if (l.soyabeanSeedVariety) facts.push({ kind: "soyabeanVariety", value: l.soyabeanSeedVariety });
      break;
    case "bardan_bag":
      if (l.bagPricePerBag != null) facts.push({ kind: "price", amount: l.bagPricePerBag, per: "bag", marketAmount: l.bagMrpPerBag ?? null });
      if (l.bagMaterialType) facts.push({ kind: "bagMaterial", value: l.bagMaterialType });
      if (l.bagDimension) facts.push({ kind: "bagDimension", value: l.bagDimension });
      break;
    case "exhaust_fan":
      if (l.fanPricePerPiece != null) facts.push({ kind: "price", amount: l.fanPricePerPiece, per: "piece", marketAmount: l.fanMrpPerPiece ?? null });
      if (l.fanBrand) facts.push({ kind: "fanBrand", value: l.fanBrand, other: l.fanBrandOther ?? null });
      if (l.fanWattage != null) facts.push({ kind: "fanWattage", watts: l.fanWattage });
      break;
    case "others":
      if (l.othersProductName) facts.push({ kind: "othersProductName", value: l.othersProductName });
      if (l.othersPrice != null) facts.push({ kind: "price", amount: l.othersPrice, per: "item", marketAmount: l.othersMrp ?? null });
      if (l.othersBrand) facts.push({ kind: "othersBrand", value: l.othersBrand });
      if (l.othersCondition) facts.push({ kind: "othersCondition", value: l.othersCondition });
      break;
  }
  return facts;
}

export function factToEnglishLabel(f: ListingDetailFact): string {
  switch (f.kind) {
    case "price": {
      const amt = formatRupeeAmount(f.amount) ?? String(f.amount);
      const per = f.per === "kg" ? "kg" : f.per === "quintal" ? "quintal" : f.per === "bag" ? "bag" : f.per === "piece" ? "piece" : null;
      const base = per ? `₹${amt}/${per}` : `₹${amt}`;
      if (f.marketAmount != null && f.marketAmount > f.amount) {
        const mrpAmt = formatRupeeAmount(f.marketAmount) ?? String(f.marketAmount);
        const mrpStr = per ? `₹${mrpAmt}/${per}` : `₹${mrpAmt}`;
        const off = Math.round(((f.marketAmount - f.amount) / f.marketAmount) * 100);
        return `${base} (MRP ${mrpStr}, ${off}% off)`;
      }
      return base;
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
    case "othersProductName": return f.value;
    case "othersBrand": return f.value;
    case "othersCondition": {
      if (f.value === "new") return "New";
      if (f.value === "used") return "Used";
      if (f.value === "refurbished") return "Refurbished";
      return f.value;
    }
  }
}

export function buildListingDescription(listing: MarketplaceListing): string {
  return extractListingDetailFacts(listing).map(factToEnglishLabel).filter(Boolean).join(" · ");
}

export function getListingUnitPrice(listing: MarketplaceListing): { price: number | null; mrp: number | null } {
  switch (listing.category) {
    case "onion_seed":
      return { price: listing.onionSeedPricePerKg ?? null, mrp: listing.onionSeedMrpPerKg ?? null };
    case "soyabean_seed":
      return { price: listing.soyabeanSeedPricePerQuintal ?? null, mrp: listing.soyabeanSeedMrpPerQuintal ?? null };
    case "bardan_bag":
      return { price: listing.bagPricePerBag ?? null, mrp: listing.bagMrpPerBag ?? null };
    case "exhaust_fan":
      return { price: listing.fanPricePerPiece ?? null, mrp: listing.fanMrpPerPiece ?? null };
    case "others":
      return { price: listing.othersPrice ?? null, mrp: listing.othersMrp ?? null };
    default:
      return { price: null, mrp: null };
  }
}
