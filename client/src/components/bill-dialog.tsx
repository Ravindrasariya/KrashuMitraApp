import { useEffect, useMemo, useState, type KeyboardEvent, type WheelEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatRupeeAmount } from "@shared/price-format";
import { buildListingDescription, getListingUnitPrice } from "@shared/listing-summary";
import type { MarketplaceListing } from "@shared/schema";
import type { User } from "@shared/models/auth";

// Bill dialog only reads non-photo metadata, so any subset of MarketplaceListing
// without `photoData` is acceptable (e.g. ListingNoPhoto from marketplace.tsx).
export type BillDialogListing = Omit<MarketplaceListing, "photoData">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: BillDialogListing;
  user: User | null | undefined;
}

interface LineState {
  description: string;
  unitPrice: string;
  discount: string;
  qty: string;
  taxRate: string;
}

type PaymentType = "cash" | "credit";

interface DraftState {
  date: string;
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  paymentType: PaymentType;
  product: LineState;
  shipping: LineState;
}

function num(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return formatRupeeAmount(Math.round(n * 100) / 100) ?? "0";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function draftKey(userId: string | undefined, listingId: number): string {
  return `kmBillDraft:${userId ?? "anon"}:${listingId}`;
}

function loadDraft(key: string): DraftState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.product && parsed.shipping) {
      // Backward-compat: older drafts may not have paymentType yet.
      const paymentType: PaymentType = parsed.paymentType === "credit" ? "credit" : "cash";
      return { ...(parsed as DraftState), paymentType };
    }
  } catch {
    /* ignore corrupt draft */
  }
  return null;
}

// Block mouse-wheel and Up/Down arrow value changes on number inputs so
// sellers don't accidentally bump their bill numbers while scrolling.
const blockWheel = (e: WheelEvent<HTMLInputElement>) => {
  e.currentTarget.blur();
};
const blockArrows = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
  }
};

export function BillDialog({ open, onOpenChange, listing, user }: Props) {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const storageKey = useMemo(() => draftKey(user?.id, listing.id), [user?.id, listing.id]);

  const defaults = useMemo<DraftState>(() => {
    const desc = buildListingDescription(listing as MarketplaceListing);
    const { price, mrp } = getListingUnitPrice(listing as MarketplaceListing);
    const unit = mrp != null ? mrp : price != null ? price : 0;
    const disc = mrp != null && price != null && mrp > price ? mrp - price : 0;
    return {
      date: todayIso(),
      buyerName: "",
      buyerAddress: "",
      buyerPhone: "",
      paymentType: "cash",
      product: {
        description: desc,
        unitPrice: String(unit),
        discount: String(disc),
        qty: "1",
        taxRate: "0",
      },
      shipping: {
        description: t("billShippingDescription"),
        unitPrice: "",
        discount: "",
        qty: "",
        taxRate: "0",
      },
    };
  }, [listing, t]);

  const [draft, setDraft] = useState<DraftState>(defaults);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage every time the dialog opens for this listing.
  useEffect(() => {
    if (!open) {
      setHydrated(false);
      return;
    }
    const saved = loadDraft(storageKey);
    setDraft(saved ?? defaults);
    setHydrated(true);
  }, [open, storageKey, defaults]);

  // Persist on every change once hydrated. Skip the very first render after
  // open so we don't immediately rewrite the saved draft with defaults.
  useEffect(() => {
    if (!open || !hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* quota / private mode — silent */
    }
  }, [draft, hydrated, open, storageKey]);

  const setProduct = (patch: Partial<LineState>) =>
    setDraft((d) => ({ ...d, product: { ...d.product, ...patch } }));
  const setShipping = (patch: Partial<LineState>) =>
    setDraft((d) => ({ ...d, shipping: { ...d.shipping, ...patch } }));

  const productNet = (num(draft.product.unitPrice) - num(draft.product.discount)) * (num(draft.product.qty) || 0);
  const productTaxAmount = (productNet * num(draft.product.taxRate)) / 100;
  const productTotal = productNet + productTaxAmount;
  const shippingNet = num(draft.shipping.unitPrice) - num(draft.shipping.discount);
  const shippingTaxAmount = (shippingNet * num(draft.shipping.taxRate)) / 100;
  const shippingTotal = shippingNet + shippingTaxAmount;
  const grandTotal = productTotal + shippingTotal;
  const grandTax = productTaxAmount + shippingTaxAmount;

  const firmMissing = !user?.firmName || !user.firmName.trim();
  const buyerAddressValid = draft.buyerAddress.trim().length > 0;

  const clearDraftAndClose = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    onOpenChange(false);
  };

  const handleGenerate = async () => {
    if (!buyerAddressValid) {
      toast({ description: t("billBuyerAddressRequired"), variant: "destructive" });
      return;
    }
    if (generating) return;
    setGenerating(true);
    try {
      // 1) Reserve a globally-unique sequence number on the server.
      const reserveRes = await apiRequest("POST", "/api/bills", {
        ...draft,
        listingId: listing.id,
      });
      const { orderNumber, invoiceNumber, billDate } = (await reserveRes.json()) as {
        orderNumber: string;
        invoiceNumber: string;
        billDate: string;
      };

      // 2) Resolve seller / signatory display.
      const firmName = user?.firmName?.trim() ?? "";
      const profileName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
      const sellerName = firmName || profileName || (user?.phoneNumber ?? "");
      const sellerAddressLines = firmName
        ? [
            user?.firmAddress ?? "",
            [user?.firmState, user?.firmPincode].filter(Boolean).join(" - "),
          ]
        : [
            [user?.village, user?.tehsil].filter(Boolean).join(", "),
            [user?.district, user?.state, user?.postalCode].filter(Boolean).join(", "),
          ];

      const formatDate = (iso: string): string => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
        return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
      };

      // 3) Build PDF.
      const { renderBillPdf, amountInWordsEn } = await import("@/lib/bill-pdf");
      const blob = await renderBillPdf({
        language,
        sellerName,
        sellerAddressLines,
        panNo: user?.firmPan ?? null,
        gstNo: user?.firmGst ?? null,
        orderNumber,
        orderDate: formatDate(billDate),
        buyerName: draft.buyerName,
        buyerAddress: draft.buyerAddress,
        buyerPhone: draft.buyerPhone,
        invoiceNumber,
        invoiceDate: formatDate(billDate),
        product: {
          description: draft.product.description,
          unitPrice: num(draft.product.unitPrice),
          discount: num(draft.product.discount),
          qty: num(draft.product.qty) || 0,
          netAmount: productNet,
          taxRate: num(draft.product.taxRate),
          taxAmount: productTaxAmount,
          totalAmount: productTotal,
        },
        shipping: {
          description: draft.shipping.description,
          unitPrice: num(draft.shipping.unitPrice),
          discount: num(draft.shipping.discount),
          qty: null,
          netAmount: shippingNet,
          taxRate: num(draft.shipping.taxRate),
          taxAmount: shippingTaxAmount,
          totalAmount: shippingTotal,
        },
        totals: { taxAmount: grandTax, totalAmount: grandTotal },
        amountInWords: amountInWordsEn(grandTotal),
        paymentMode: draft.paymentType,
        signatoryName: sellerName,
        labels: {
          taxInvoice: t("billPdfTaxInvoice"),
          originalForRecipient: t("billPdfOriginalForRecipient"),
          soldBy: t("billPdfSoldBy"),
          billingAddress: t("billPdfBillingAddress"),
          panNo: t("billPdfPanNo"),
          gstNo: t("billPdfGstNo"),
          orderNumber: t("billPdfOrderNumber"),
          orderDate: t("billPdfOrderDate"),
          invoiceNumber: t("billPdfInvoiceNumber"),
          invoiceDate: t("billPdfInvoiceDate"),
          slNo: t("billColSlNo"),
          description: t("billColDescription"),
          unitPrice: t("billColUnitPrice"),
          discount: t("billColDiscount"),
          qty: t("billColQty"),
          netAmount: t("billColNet"),
          taxRate: t("billColTaxRate"),
          taxType: t("billPdfTaxType"),
          taxAmount: t("billPdfTaxAmount"),
          total: t("billColTotal"),
          totalRow: t("billPdfTotal"),
          amountInWords: t("billPdfAmountInWords"),
          paymentMode: t("billPdfPaymentMode"),
          cash: t("cash"),
          credit: t("billCredit"),
          forLabel: t("billPdfFor"),
          authorisedSignatory: t("billPdfAuthorisedSignatory"),
          noSignatureRequired: t("billPdfNoSignatureRequired"),
          thankYou: t("billPdfThankYou"),
        },
      });

      const fileName = `KrashuVed-Bill-${invoiceNumber}.pdf`;
      const file = new File([blob], fileName, { type: "application/pdf" });

      // 4) Try Web Share with the file; fall back to download.
      let shared = false;
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (typeof nav.canShare === "function" && typeof nav.share === "function" && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: invoiceNumber });
          shared = true;
        } catch {
          /* user cancelled — fall through to download */
        }
      }
      if (!shared) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      // Refresh the buyer ledger so the new bill / buyer appears immediately.
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });

      clearDraftAndClose();
    } catch (err) {
      console.error("Bill generation failed", err);
      toast({ description: t("billGenerateFailed"), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCancel = () => {
    clearDraftAndClose();
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

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label htmlFor="bill-date">{t("billDate")}</Label>
            <Input
              id="bill-date"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              data-testid="input-bill-date"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bill-buyer-name">{t("billBuyerName")}</Label>
            <Input
              id="bill-buyer-name"
              value={draft.buyerName}
              onChange={(e) => setDraft((d) => ({ ...d, buyerName: e.target.value }))}
              data-testid="input-bill-buyer-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bill-buyer-address">
              {t("billBuyerAddress")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bill-buyer-address"
              value={draft.buyerAddress}
              onChange={(e) => setDraft((d) => ({ ...d, buyerAddress: e.target.value }))}
              aria-invalid={!buyerAddressValid}
              data-testid="input-bill-buyer-address"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bill-buyer-phone">{t("billBuyerPhone")}</Label>
            <Input
              id="bill-buyer-phone"
              type="tel"
              inputMode="numeric"
              value={draft.buyerPhone}
              onChange={(e) => setDraft((d) => ({ ...d, buyerPhone: e.target.value }))}
              data-testid="input-bill-buyer-phone"
            />
          </div>
        </div>

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
                    value={draft.product.description}
                    onChange={(e) => setProduct({ description: e.target.value })}
                    rows={2}
                    className="min-w-[12rem]"
                    data-testid="input-bill-product-description"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.product.unitPrice}
                    onChange={(e) => setProduct({ unitPrice: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-product-unit-price"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.product.discount}
                    onChange={(e) => setProduct({ discount: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-product-discount"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={draft.product.qty}
                    onChange={(e) => setProduct({ qty: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
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
                    value={draft.product.taxRate}
                    onChange={(e) => setProduct({ taxRate: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
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
                    value={draft.shipping.description}
                    onChange={(e) => setShipping({ description: e.target.value })}
                    rows={1}
                    className="min-w-[12rem]"
                    data-testid="input-bill-shipping-description"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.shipping.unitPrice}
                    onChange={(e) => setShipping({ unitPrice: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-shipping-unit-price"
                  />
                </td>
                <td className="border p-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.shipping.discount}
                    onChange={(e) => setShipping({ discount: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
                    className={`${numCellClass} text-right`}
                    data-testid="input-bill-shipping-discount"
                  />
                </td>
                <td className="border p-1">
                  {/* Shipping has no qty multiplier (net = unitPrice - discount),
                      so this cell is intentionally disabled. Wheel/arrow locks
                      are not needed — a disabled input ignores both. */}
                  <Input
                    disabled
                    value={draft.shipping.qty}
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
                    value={draft.shipping.taxRate}
                    onChange={(e) => setShipping({ taxRate: e.target.value })}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="bill-payment-type" className="text-xs font-normal text-muted-foreground">
                        {t("paymentType")}
                      </Label>
                      <Select
                        value={draft.paymentType}
                        onValueChange={(v) => setDraft((d) => ({ ...d, paymentType: v as PaymentType }))}
                      >
                        <SelectTrigger
                          id="bill-payment-type"
                          className="h-8 w-[7.5rem]"
                          data-testid="select-bill-payment-type"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">{t("cash")}</SelectItem>
                          <SelectItem value="credit">{t("billCredit")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge
                        variant="outline"
                        className={
                          draft.paymentType === "cash"
                            ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800"
                            : "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                        }
                        data-testid="badge-bill-payment-type"
                      >
                        {draft.paymentType === "cash" ? t("cash") : t("billCredit")}
                      </Badge>
                    </div>
                    <div className="text-right pr-2">{t("billTotal")}</div>
                  </div>
                </td>
                <td className="border p-2"></td>
                <td className="border p-2 text-right tabular-nums" data-testid="text-bill-grand-total">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={generating} data-testid="button-bill-cancel">
            {t("cancel")}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!buyerAddressValid || generating}
            data-testid="button-bill-generate"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("billGenerating")}
              </>
            ) : (
              t("generateBill")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
