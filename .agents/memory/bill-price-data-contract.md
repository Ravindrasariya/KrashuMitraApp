---
name: Bill price data contract (MRP vs KrashuVed net)
description: How marketplace bills store price, and the netting rule any consumer of bill payloads must apply.
---

# Bill price data contract

When a bill is generated from a marketplace listing (`client/src/components/bill-dialog.tsx`),
the saved `bills.payload.product` stores:
- `unitPrice` = the **MRP** (struck-through price)
- `discount`  = `MRP - KrashuVed price` (the final/selling price)

So the price the buyer actually paid (the "KrashuVed price") is **`unitPrice - discount`**, NOT `unitPrice`.

**Why:** the bill/PDF line wants to show MRP with a discount column, so the listing's
MRP goes into `unitPrice` and the delta into `discount`. The net is the real sale price.

**How to apply:** any feature that reports the sale price from bill payloads must subtract
the discount. The "recent buyers" badge (`getRecentBuyerGroupsForListing` in `server/storage.ts`)
originally read only `unitPrice` and wrongly showed MRP — fixed to net. Legacy bills with no
discount field net to the original unitPrice (discount treated as 0).
