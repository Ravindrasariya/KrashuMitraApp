import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Pencil, Flag, Loader2, Share2, ArrowUpDown } from "lucide-react";
import type { Bill, Buyer } from "@shared/schema";
import { formatRupeeAmount } from "@shared/price-format";
import type { User } from "@shared/models/auth";

type BuyerWithDue = Buyer & { totalDue: string; totalPaid: string };

type BillPayload = {
  date?: string;
  buyerName?: string;
  buyerAddress?: string;
  buyerPhone?: string;
  paymentType?: string;
  product?: { description?: string; unitPrice?: number; discount?: number; qty?: number; taxRate?: number };
  shipping?: { description?: string; unitPrice?: number; discount?: number; taxRate?: number };
  listingId?: number;
};

type SaveBuyerResponse =
  | { conflict: Buyer }
  | { buyer: BuyerWithDue; merged?: boolean; survivorId?: number; deletedId?: number };

function fmtRupee(n: number | string | null | undefined): string {
  return `₹${formatRupeeAmount(n) ?? "0"}`;
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}
function todayIso(): string {
  // IST date — `en-CA` returns ISO `YYYY-MM-DD` in the requested time zone.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function billGrandTotal(b: Bill): number {
  const payload = (b.payload ?? {}) as BillPayload;
  const p = payload.product ?? {};
  const s = payload.shipping ?? {};
  const pn = (Number(p.unitPrice ?? 0) - Number(p.discount ?? 0)) * Number(p.qty ?? 0);
  const pt = pn * (1 + Number(p.taxRate ?? 0) / 100);
  const sn = Number(s.unitPrice ?? 0) - Number(s.discount ?? 0);
  const st = sn * (1 + Number(s.taxRate ?? 0) / 100);
  return Math.round((pt + st) * 100) / 100;
}

export default function BillingPage() {
  const { t, language } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<BuyerWithDue | null>(null);
  const [sortBy, setSortBy] = useState<"due" | "code">("due");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/auth");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: buyers = [], isLoading, isError, refetch } = useQuery<BuyerWithDue[]>({
    queryKey: ["/api/buyers"],
    enabled: isAuthenticated,
  });

  const sorted = useMemo(() => {
    const arr = [...buyers];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "due") cmp = Number(a.totalDue) - Number(b.totalDue);
      else cmp = a.buyerCode.localeCompare(b.buyerCode);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [buyers, sortBy, sortDir]);

  const grandTotalDue = useMemo(
    () => buyers.reduce((sum, b) => sum + Number(b.totalDue || 0), 0),
    [buyers],
  );

  const toggleSort = (key: "due" | "code") => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(key); setSortDir(key === "due" ? "desc" : "asc"); }
  };

  if (authLoading || isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-3 md:p-4 space-y-3" data-testid="page-billing">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold" data-testid="text-billing-title">{t("billingPageTitle")}</h1>
        <div className="text-sm font-semibold" data-testid="text-billing-grand-total">
          {t("colTotalDue")}: {fmtRupee(grandTotalDue)}
        </div>
      </div>

      {isError ? (
        <Card className="p-6 text-center text-sm text-red-600 dark:text-red-400" data-testid="text-buyers-load-error">
          {language === "hi" ? "खरीदार सूची लोड नहीं हो सकी।" : "Could not load buyers."}
          <button type="button" className="ml-2 underline" onClick={() => refetch()} data-testid="button-retry-buyers">
            {language === "hi" ? "पुनः प्रयास" : "Retry"}
          </button>
        </Card>
      ) : sorted.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground" data-testid="text-buyers-empty">
          {t("buyersListEmpty")}
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 w-8"></th>
                <th className="p-2 w-8"></th>
                <th className="p-2">
                  <button onClick={() => toggleSort("code")} className="inline-flex items-center gap-1 font-semibold" data-testid="button-sort-code">
                    {t("colBuyerId")} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-2">{t("colName")}</th>
                <th className="p-2 hidden md:table-cell">{t("colAddress")}</th>
                <th className="p-2">{t("colPhone")}</th>
                <th className="p-2 hidden sm:table-cell text-center">{t("colRedFlag")}</th>
                <th className="p-2 text-right">
                  <button onClick={() => toggleSort("due")} className="inline-flex items-center gap-1 font-semibold" data-testid="button-sort-due">
                    {t("colTotalDue")} <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <BuyerRow
                  key={b.id}
                  buyer={b}
                  expanded={expandedId === b.id}
                  onToggleExpand={() => setExpandedId((p) => (p === b.id ? null : b.id))}
                  onEdit={() => setEditing(b)}
                  language={language}
                  user={user}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <EditBuyerDialog
          buyer={editing}
          onClose={() => setEditing(null)}
          t={t}
          toast={toast}
        />
      )}
    </div>
  );
}

function BuyerRow({
  buyer, expanded, onToggleExpand, onEdit, language, user, t,
}: {
  buyer: BuyerWithDue;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  language: "hi" | "en";
  user: User | null | undefined;
  t: (k: TranslationKey) => string;
}) {
  return (
    <>
      <tr className="border-t hover-elevate" data-testid={`row-buyer-${buyer.id}`}>
        <td className="p-2">
          <button onClick={onEdit} aria-label={t("editBuyer")} className="p-1" data-testid={`button-edit-buyer-${buyer.id}`}>
            <Pencil className="w-4 h-4" />
          </button>
        </td>
        <td className="p-2">
          <button onClick={onToggleExpand} className="p-1" data-testid={`button-expand-buyer-${buyer.id}`}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="p-2 font-mono text-xs" data-testid={`text-buyer-code-${buyer.id}`}>{buyer.buyerCode}</td>
        <td className="p-2" data-testid={`text-buyer-name-${buyer.id}`}>{buyer.name || "—"}</td>
        <td className="p-2 hidden md:table-cell text-muted-foreground text-xs">{buyer.address || "—"}</td>
        <td className="p-2" data-testid={`text-buyer-phone-${buyer.id}`}>{buyer.phone || "—"}</td>
        <td className="p-2 hidden sm:table-cell text-center">
          {buyer.redFlag && <Flag className="w-4 h-4 text-red-600 inline" data-testid={`icon-redflag-${buyer.id}`} />}
        </td>
        <td className="p-2 text-right font-semibold tabular-nums" data-testid={`text-buyer-due-${buyer.id}`}>
          {fmtRupee(buyer.totalDue)}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/20">
          <td colSpan={8} className="p-3">
            <div className="md:hidden text-xs text-muted-foreground mb-2">
              <strong>{t("colAddress")}:</strong> {buyer.address || "—"}
            </div>
            <BuyerHistory buyer={buyer} language={language} user={user} t={t} />
          </td>
        </tr>
      )}
    </>
  );
}

function BuyerHistory({ buyer, language, user, t }: {
  buyer: BuyerWithDue;
  language: "hi" | "en";
  user: User | null | undefined;
  t: (k: TranslationKey) => string;
}) {
  const { toast } = useToast();
  const { data: bills = [], isLoading, isError, refetch } = useQuery<Bill[]>({
    queryKey: ["/api/buyers", buyer.id, "bills"],
    queryFn: async () => {
      const res = await fetch(`/api/buyers/${buyer.id}/bills`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const [editingPaidId, setEditingPaidId] = useState<number | null>(null);
  const [paidDateInput, setPaidDateInput] = useState<string>(todayIso());

  const markPaid = useMutation({
    mutationFn: async ({ id, paidDate }: { id: number; paidDate: string | null }) => {
      const res = await apiRequest("POST", `/api/bills/${id}/mark-paid`, { paidDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers", buyer.id, "bills"] });
      setEditingPaidId(null);
    },
  });

  const totalPaid = bills.reduce((s, b) => s + (b.paidAt ? billGrandTotal(b) : 0), 0);
  const totalDue = bills.reduce((s, b) => s + (b.paymentType === "credit" && !b.paidAt ? billGrandTotal(b) : 0), 0)
    + Number(buyer.openingBalance);

  if (isLoading) return <div className="text-center py-3"><Loader2 className="w-4 h-4 inline animate-spin" /></div>;
  if (isError) return (
    <div className="text-center py-3 text-xs text-red-600 dark:text-red-400" data-testid="text-bills-load-error">
      {language === "hi" ? "बिल लोड नहीं हो सके।" : "Could not load bills."}
      <button type="button" className="ml-2 underline" onClick={() => refetch()} data-testid="button-retry-bills">
        {language === "hi" ? "पुनः प्रयास" : "Retry"}
      </button>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="p-2 text-left">{t("colPurchaseDate")}</th>
            <th className="p-2 text-left">{t("colProduct")}</th>
            <th className="p-2 text-right">{t("colQuantity")}</th>
            <th className="p-2 text-right">{t("colAmount")}</th>
            <th className="p-2 text-center">{t("colPaymentMode")}</th>
            <th className="p-2 text-center">{t("colStatus")}</th>
            <th className="p-2 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => {
            const p = ((b.payload ?? {}) as BillPayload).product ?? {};
            const total = billGrandTotal(b);
            const isPaid = !!b.paidAt;
            return (
              <tr key={b.id} className="border-t" data-testid={`row-bill-${b.id}`}>
                <td className="p-2">{fmtDate(b.billDate)}</td>
                <td className="p-2 max-w-xs truncate">{p.description ?? "—"}</td>
                <td className="p-2 text-right tabular-nums">{p.qty ?? "—"}</td>
                <td className="p-2 text-right tabular-nums font-medium">{fmtRupee(total)}</td>
                <td className="p-2 text-center">
                  <Badge variant="outline" className={b.paymentType === "cash"
                    ? "bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300"}>
                    {b.paymentType === "cash" ? t("cash") : t("billCredit")}
                  </Badge>
                </td>
                <td className="p-2 text-center">
                  {b.paymentType === "cash" ? (
                    <Badge className="bg-green-600 hover:bg-green-700" data-testid={`badge-paid-${b.id}`}>
                      {t("paid")}
                    </Badge>
                  ) : isPaid ? (
                    editingPaidId === b.id ? (
                      <div className="flex flex-col gap-1 items-center">
                        <Input type="date" value={paidDateInput} onChange={(e) => setPaidDateInput(e.target.value)} className="h-7 text-xs w-32" data-testid={`input-paid-date-${b.id}`} />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-6 text-xs" onClick={() => markPaid.mutate({ id: b.id, paidDate: paidDateInput })} data-testid={`button-confirm-paid-${b.id}`}>OK</Button>
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => {
                            if (window.confirm(t("markUnpaidConfirm"))) {
                              markPaid.mutate({ id: b.id, paidDate: null });
                            }
                          }} data-testid={`button-mark-unpaid-${b.id}`}>{t("markUnpaid")}</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingPaidId(b.id);
                          setPaidDateInput(b.paidAt ?? todayIso());
                        }}
                        className="inline-flex"
                        data-testid={`badge-paid-${b.id}`}
                      >
                        <Badge className="bg-green-600 hover:bg-green-700">
                          {t("paidOn").replace("{date}", fmtDate(b.paidAt ?? b.billDate))}
                        </Badge>
                      </button>
                    )
                  ) : (
                    editingPaidId === b.id ? (
                      <div className="flex flex-col gap-1 items-center">
                        <Input type="date" value={paidDateInput} onChange={(e) => setPaidDateInput(e.target.value)} className="h-7 text-xs w-32" data-testid={`input-paid-date-${b.id}`} />
                        <Button size="sm" className="h-6 text-xs" onClick={() => markPaid.mutate({ id: b.id, paidDate: paidDateInput })} data-testid={`button-confirm-paid-${b.id}`}>OK</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs border-orange-400 text-orange-700"
                        onClick={() => { setEditingPaidId(b.id); setPaidDateInput(todayIso()); }}
                        data-testid={`button-mark-paid-${b.id}`}
                      >
                        {t("markPaid")}
                      </Button>
                    )
                  )}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => sharePdf(b, user, language, t, toast)}
                    title={t("shareOnWhatsapp")}
                    aria-label={t("shareOnWhatsapp")}
                    className="p-1 text-green-600 hover:text-green-700"
                    data-testid={`button-share-bill-${b.id}`}
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
          {Number(buyer.openingBalance) > 0 && (
            <tr className="border-t bg-muted/30" data-testid={`row-opening-balance-${buyer.id}`}>
              <td className="p-2 text-muted-foreground">—</td>
              <td className="p-2 italic">{t("openingBalance")}</td>
              <td className="p-2 text-right">—</td>
              <td className="p-2 text-right tabular-nums font-medium">{fmtRupee(buyer.openingBalance)}</td>
              <td className="p-2 text-center">
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300">{t("billCredit")}</Badge>
              </td>
              <td className="p-2 text-center">
                <Badge variant="outline" className="border-orange-400 text-orange-700">{t("unpaid")}</Badge>
              </td>
              <td className="p-2"></td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold bg-muted/40">
            <td className="p-2" colSpan={3}>{t("totalPaid")}: {fmtRupee(totalPaid)}</td>
            <td className="p-2 text-right" colSpan={4}>{t("colTotalDue")}: {fmtRupee(totalDue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

async function sharePdf(
  bill: Bill,
  user: User | null | undefined,
  language: "hi" | "en",
  t: (k: TranslationKey) => string,
  toast: ReturnType<typeof import("@/hooks/use-toast")["useToast"]>["toast"],
) {
  try {
    const payload = (bill.payload ?? {}) as BillPayload;
    const yyyymmdd = String(bill.billDate).replace(/-/g, "");
    const orderNumber = `ON${yyyymmdd}${bill.sequenceNo}`;
    const invoiceNumber = `IN${yyyymmdd}${bill.sequenceNo}`;
    const formatDate = (iso: string): string => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
    };
    const firmName = user?.firmName?.trim() ?? "";
    const profileName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    const sellerName = firmName || profileName || (user?.phoneNumber ?? "");
    const sellerAddressLines = firmName
      ? [user?.firmAddress ?? "", [user?.firmState, user?.firmPincode].filter(Boolean).join(" - ")]
      : [
          [user?.village, user?.tehsil].filter(Boolean).join(", "),
          [user?.district, user?.state, user?.postalCode].filter(Boolean).join(", "),
        ];
    const p = payload.product ?? {};
    const s = payload.shipping ?? {};
    const num = (v: unknown) => Number(v ?? 0);
    const productNet = (num(p.unitPrice) - num(p.discount)) * num(p.qty);
    const productTax = (productNet * num(p.taxRate)) / 100;
    const productTotal = productNet + productTax;
    const shippingNet = num(s.unitPrice) - num(s.discount);
    const shippingTax = (shippingNet * num(s.taxRate)) / 100;
    const shippingTotal = shippingNet + shippingTax;
    const grand = productTotal + shippingTotal;

    const { renderBillPdf, amountInWordsEn } = await import("@/lib/bill-pdf");
    const blob = await renderBillPdf({
      language,
      sellerName,
      sellerAddressLines,
      panNo: user?.firmPan ?? null,
      gstNo: user?.firmGst ?? null,
      orderNumber,
      orderDate: formatDate(bill.billDate),
      buyerName: payload.buyerName ?? "",
      buyerAddress: payload.buyerAddress ?? "",
      buyerPhone: payload.buyerPhone ?? "",
      invoiceNumber,
      invoiceDate: formatDate(bill.billDate),
      product: {
        description: p.description ?? "",
        unitPrice: num(p.unitPrice), discount: num(p.discount),
        qty: num(p.qty) || 0, netAmount: productNet,
        taxRate: num(p.taxRate), taxAmount: productTax, totalAmount: productTotal,
      },
      shipping: {
        description: s.description ?? "",
        unitPrice: num(s.unitPrice), discount: num(s.discount),
        qty: null, netAmount: shippingNet,
        taxRate: num(s.taxRate), taxAmount: shippingTax, totalAmount: shippingTotal,
      },
      totals: { taxAmount: productTax + shippingTax, totalAmount: grand },
      amountInWords: amountInWordsEn(grand),
      paymentMode: bill.paymentType as "cash" | "credit",
      signatoryName: sellerName,
      labels: {
        taxInvoice: t("billPdfTaxInvoice"), originalForRecipient: t("billPdfOriginalForRecipient"),
        soldBy: t("billPdfSoldBy"), billingAddress: t("billPdfBillingAddress"),
        panNo: t("billPdfPanNo"), gstNo: t("billPdfGstNo"),
        orderNumber: t("billPdfOrderNumber"), orderDate: t("billPdfOrderDate"),
        invoiceNumber: t("billPdfInvoiceNumber"), invoiceDate: t("billPdfInvoiceDate"),
        slNo: t("billColSlNo"), description: t("billColDescription"),
        unitPrice: t("billColUnitPrice"), discount: t("billColDiscount"),
        qty: t("billColQty"), netAmount: t("billColNet"),
        taxRate: t("billColTaxRate"), taxType: t("billPdfTaxType"),
        taxAmount: t("billPdfTaxAmount"), total: t("billColTotal"),
        totalRow: t("billPdfTotal"), amountInWords: t("billPdfAmountInWords"),
        paymentMode: t("billPdfPaymentMode"), cash: t("cash"), credit: t("billCredit"),
        forLabel: t("billPdfFor"), authorisedSignatory: t("billPdfAuthorisedSignatory"),
        noSignatureRequired: t("billPdfNoSignatureRequired"), thankYou: t("billPdfThankYou"),
      },
    });

    const fileName = `KrashuVed-Bill-${invoiceNumber}.pdf`;
    const file = new File([blob], fileName, { type: "application/pdf" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (typeof nav.canShare === "function" && typeof nav.share === "function" && nav.canShare({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: invoiceNumber,
          text: `${sellerName}: Bill ${invoiceNumber}, Total ${fmtRupee(grand)}`,
        });
        return;
      } catch (err) {
        // User-initiated cancel ⇒ do nothing (no fallback download, no toast).
        // Only fall through on a real share failure.
        const e = err as { name?: string; message?: string } | undefined;
        if (e?.name === "AbortError" || /cancel|abort/i.test(e?.message ?? "")) {
          return;
        }
        // Real failure — fall through to desktop download.
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast({ description: t("billDownloadedDesktop") });
  } catch (e) {
    console.error("share pdf failed", e);
    toast({ description: t("shareFailed"), variant: "destructive" });
  }
}

function EditBuyerDialog({ buyer, onClose, t, toast }: {
  buyer: BuyerWithDue;
  onClose: () => void;
  t: (k: TranslationKey) => string;
  toast: ReturnType<typeof import("@/hooks/use-toast")["useToast"]>["toast"];
}) {
  const [name, setName] = useState(buyer.name ?? "");
  const [phone, setPhone] = useState(buyer.phone ?? "");
  const [address, setAddress] = useState(buyer.address ?? "");
  const [redFlag, setRedFlag] = useState<boolean>(!!buyer.redFlag);
  const [openingBalance, setOpeningBalance] = useState<string>(String(buyer.openingBalance ?? "0"));
  const [conflict, setConflict] = useState<Buyer | null>(null);

  const save = useMutation<SaveBuyerResponse, Error, number | undefined>({
    mutationFn: async (mergeWith) => {
      const body: {
        name: string; phone: string; address: string;
        redFlag: boolean; openingBalance: string; mergeWith?: number;
      } = { name, phone, address, redFlag, openingBalance };
      if (mergeWith) body.mergeWith = mergeWith;
      const res = await fetch(`/api/buyers/${buyer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.status === 409) {
        const data = (await res.json()) as { conflictBuyer: Buyer };
        return { conflict: data.conflictBuyer };
      }
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<SaveBuyerResponse>;
    },
    onSuccess: (data) => {
      if ("conflict" in data) {
        setConflict(data.conflict);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/buyers", buyer.id, "bills"] });
      if (data.merged && data.survivorId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/buyers", data.survivorId, "bills"] });
        toast({ description: t("buyersMerged") });
      } else {
        toast({ description: t("buyerSaved") });
      }
      onClose();
    },
    onError: () => toast({ description: t("buyerSaveFailed"), variant: "destructive" }),
  });

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent data-testid="dialog-edit-buyer">
          <DialogHeader><DialogTitle>{t("editBuyer")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("colName")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-edit-buyer-name" />
            </div>
            <div className="space-y-1">
              <Label>{t("colPhone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-edit-buyer-phone" />
            </div>
            <div className="space-y-1">
              <Label>{t("colAddress")}</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} data-testid="input-edit-buyer-address" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-buyer-redflag">{t("colRedFlag")}</Label>
              <Switch id="edit-buyer-redflag" checked={redFlag} onCheckedChange={setRedFlag} data-testid="switch-edit-buyer-redflag" />
            </div>
            <div className="space-y-1">
              <Label>{t("openingBalance")} (₹)</Label>
              <Input type="number" inputMode="decimal" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} data-testid="input-edit-buyer-opening" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} data-testid="button-edit-buyer-cancel">{t("cancel")}</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate(undefined)} data-testid="button-edit-buyer-save">
              {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {conflict && (
        <Dialog open onOpenChange={(o) => { if (!o) setConflict(null); }}>
          <DialogContent data-testid="dialog-merge-confirm">
            <DialogHeader><DialogTitle>{t("mergeBuyersTitle")}</DialogTitle></DialogHeader>
            <p className="text-sm">{t("mergeBuyersBody").replace("{code}", conflict.buyerCode)}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConflict(null)} data-testid="button-merge-cancel">{t("cancel")}</Button>
              <Button onClick={() => save.mutate(conflict.id)} disabled={save.isPending} data-testid="button-merge-confirm">
                {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {t("mergeContinue")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
