import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { formatRupeeAmount } from "@shared/price-format";
import { buildListingDescription, getListingUnitPrice } from "@shared/listing-summary";
import type { MarketplaceListing } from "@shared/schema";
import type { User } from "@shared/models/auth";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: MarketplaceListing;
  user: User | null | undefined;
}

interface LineState {
  description: string;
  unitPrice: string;
  discount: string;
  qty: string;
  taxRate: string;
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return formatRupeeAmount(Math.round(n * 100) / 100) ?? "0";
}

export function BillDialog({ open, onOpenChange, listing, user }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { defaultDescription, defaultUnitPrice, defaultDiscount } = useMemo(() => {
    const desc = buildListingDescription(listing);
    const { price, mrp } = getListingUnitPrice(listing);
    const unit = mrp != null ? mrp : price ?? 0;
    const disc = mrp != null && price != null && mrp > price ? mrp - price : 0;
    return {
      defaultDescription: desc,
      defaultUnitPrice: unit ? String(unit) : "",
      defaultDiscount: disc ? String(disc) : "",
    };
  }, [listing]);

  const [product, setProduct] = useState<LineState>({
    description: defaultDescription,
    unitPrice: defaultUnitPrice,
    discount: defaultDiscount,
    qty: "1",
    taxRate: "0",
  });
  const [shipping, setShipping] = useState<LineState>({
    description: t("billShippingDescription"),
    unitPrice: "",
    discount: "",
    qty: "",
    taxRate: "0",
  });

  const productNet = (num(product.unitPrice) - num(product.discount)) * (num(product.qty) || 0);
  const productTotal = productNet + (productNet * num(product.taxRate)) / 100;
  const shippingNet = num(shipping.unitPrice) - num(shipping.discount);
  const shippingTotal = shippingNet + (shippingNet * num(shipping.taxRate)) / 100;
  const grandTotal = productTotal + shippingTotal;

  const firmMissing = !user?.firmName || !user.firmName.trim();

  const handleGenerate = () => {
    toast({ description: t("billPdfComingSoon") });
    onOpenChange(false);
  };

  const numCellClass = "w-24 min-w-[6rem]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-bill">
        <DialogHeader>
          <DialogTitle>{t("billDialogTitle")}</DialogTitle>
        </DialogHeader>

        {firmMissing && (
          <div
            className="text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900 rounded-md p-3"
            data-testid="text-bill-firm-missing"
          >
            {t("billFirmMissing")}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="border p-2 text-left w-12">{t("billColSlNo")}</th>
                <th className="border p-2 text-left min-w-[12rem]">{t("billColDescription")}</th>
                <th className="border p-2 text-right">{t("billColUnitPrice")}</th>
                <th className="border p-2 text-right">{t("billColDiscount")}</th>
                <th className="border p-2 text-right">{t("billColQty")}</th>
                <th className="border p-2 text-right">{t("billColNet")}</th>
                <th className="border p-2 text-right">{t("billColTaxRate")}</th>
                <th className="border p-2 text-right">{t("billColTotal")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-2 text-center font-medium" data-testid="text-bill-product-sl">1</td>
                <td className="border p-1">
                  <Textarea
                    value={product.description}
                    onChange={(e) => setProduct({ ...product, description: e.target.value })}
                    rows={2}
                    className="min-w-[12rem]"
                    data-testid="input-bill-product-description"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={product.unitPrice}
                    onChange={(e) => setProduct({ ...product, unitPrice: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-product-unit-price"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={product.discount}
                    onChange={(e) => setProduct({ ...product, discount: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-product-discount"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={product.qty}
                    onChange={(e) => setProduct({ ...product, qty: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-product-qty"
                  />
                </td>
                <td className="border p-2 text-right tabular-nums" data-testid="text-bill-product-net">
                  {fmt(productNet)}
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={product.taxRate}
                    onChange={(e) => setProduct({ ...product, taxRate: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-product-tax"
                  />
                </td>
                <td className="border p-2 text-right tabular-nums" data-testid="text-bill-product-total">
                  {fmt(productTotal)}
                </td>
              </tr>
              <tr>
                <td className="border p-2 text-center font-medium" data-testid="text-bill-shipping-sl">2</td>
                <td className="border p-1">
                  <Textarea
                    value={shipping.description}
                    onChange={(e) => setShipping({ ...shipping, description: e.target.value })}
                    rows={1}
                    className="min-w-[12rem]"
                    data-testid="input-bill-shipping-description"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={shipping.unitPrice}
                    onChange={(e) => setShipping({ ...shipping, unitPrice: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-shipping-unit-price"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={shipping.discount}
                    onChange={(e) => setShipping({ ...shipping, discount: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-shipping-discount"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    disabled
                    value={shipping.qty}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-shipping-qty"
                  />
                </td>
                <td className="border p-2 text-right tabular-nums" data-testid="text-bill-shipping-net">
                  {fmt(shippingNet)}
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={shipping.taxRate}
                    onChange={(e) => setShipping({ ...shipping, taxRate: e.target.value })}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-shipping-tax"
                  />
                </td>
                <td className="border p-2 text-right tabular-nums" data-testid="text-bill-shipping-total">
                  {fmt(shippingTotal)}
                </td>
              </tr>
              <tr className="font-semibold bg-muted/50">
                <td className="border p-2" colSpan={6}>
                  <div className="text-right pr-2">{t("billTotal")}</div>
                </td>
                <td className="border p-2"></td>
                <td className="border p-2 text-right tabular-nums" data-testid="text-bill-grand-total">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button onClick={handleGenerate} data-testid="button-bill-generate">
            {t("generateBill")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
