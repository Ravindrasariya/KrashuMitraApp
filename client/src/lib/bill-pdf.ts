import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import numberToWords from "number-to-words";

export type BillLanguage = "hi" | "en";
export type BillPaymentMode = "cash" | "credit";

export interface BillPdfLine {
  description: string;
  unitPrice: number;
  discount: number;
  qty: number | null; // null for shipping (no qty multiplier)
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
}

export interface BillPdfData {
  language: BillLanguage;
  // Seller block (resolved by caller — firm details preferred, profile fallback)
  sellerName: string;
  sellerAddressLines: string[];
  panNo: string | null;
  gstNo: string | null;
  orderNumber: string;
  orderDate: string; // dd.mm.yyyy
  // Buyer block
  buyerName: string;
  buyerAddress: string;
  buyerPhone: string;
  invoiceNumber: string;
  invoiceDate: string; // dd.mm.yyyy
  // Lines
  product: BillPdfLine;
  shipping: BillPdfLine;
  totals: { taxAmount: number; totalAmount: number };
  amountInWords: string;
  paymentMode: BillPaymentMode;
  signatoryName: string;
  // Bilingual labels (caller passes via i18n.t())
  labels: {
    taxInvoice: string;
    originalForRecipient: string;
    soldBy: string;
    billingAddress: string;
    panNo: string;
    gstNo: string;
    orderNumber: string;
    orderDate: string;
    invoiceNumber: string;
    invoiceDate: string;
    slNo: string;
    description: string;
    unitPrice: string;
    discount: string;
    qty: string;
    netAmount: string;
    taxRate: string;
    taxType: string;
    taxAmount: string;
    total: string;
    totalRow: string;
    amountInWords: string;
    paymentMode: string;
    cash: string;
    credit: string;
    forLabel: string;
    authorisedSignatory: string;
    noSignatureRequired: string;
    thankYou: string;
  };
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function money(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyRupee(n: number): string {
  return `₹${money(n)}`;
}

function pct(n: number): string {
  // Drop trailing .00 if integer
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(2)}%`;
}

// "Krashu" green + "Ved" orange wordmark — same colours as the app header.
function brandWordmarkHtml(language: BillLanguage): string {
  if (language === "hi") {
    return (
      `<span style="font-size:28px;font-weight:800;letter-spacing:.5px;">` +
      `<span style="color:#16a34a;">कृषु</span>` +
      `<span style="color:#ea580c;">वेद</span>` +
      `</span>`
    );
  }
  return (
    `<span style="font-size:28px;font-weight:800;letter-spacing:.5px;">` +
    `<span style="color:#16a34a;">Krashu</span>` +
    `<span style="color:#ea580c;">Ved</span>` +
    `</span>`
  );
}

function lineRowHtml(slNo: string, line: BillPdfLine, labels: BillPdfData["labels"]): string {
  return `
    <tr>
      <td class="td c">${escapeHtml(slNo)}</td>
      <td class="td l">${escapeHtml(line.description)}</td>
      <td class="td r">${escapeHtml(moneyRupee(line.unitPrice))}</td>
      <td class="td r">${escapeHtml(moneyRupee(line.discount))}</td>
      <td class="td c">${line.qty == null ? "" : escapeHtml(String(line.qty))}</td>
      <td class="td r">${escapeHtml(moneyRupee(line.netAmount))}</td>
      <td class="td r">${escapeHtml(pct(line.taxRate))}</td>
      <td class="td c">GST</td>
      <td class="td r">${escapeHtml(moneyRupee(line.taxAmount))}</td>
      <td class="td r">${escapeHtml(moneyRupee(line.totalAmount))}</td>
    </tr>
  `;
}

function buildInvoiceHtml(d: BillPdfData): string {
  const sellerLines = d.sellerAddressLines.filter((l) => l && l.trim().length > 0);
  const panRow = d.panNo && d.panNo.trim()
    ? `<div class="row-line"><strong>${escapeHtml(d.labels.panNo)}</strong>&nbsp;${escapeHtml(d.panNo.trim())}</div>`
    : "";
  const gstRow = d.gstNo && d.gstNo.trim()
    ? `<div class="row-line"><strong>${escapeHtml(d.labels.gstNo)}</strong>&nbsp;${escapeHtml(d.gstNo.trim())}</div>`
    : "";

  const buyerLines = [d.buyerName, d.buyerAddress, d.buyerPhone].filter((l) => l && l.trim().length > 0);

  const paymentLabel = d.paymentMode === "cash" ? d.labels.cash : d.labels.credit;
  const paymentColor = d.paymentMode === "cash" ? "#15803d" : "#c2410c";
  const paymentBg = d.paymentMode === "cash" ? "#dcfce7" : "#ffedd5";
  const paymentBorder = d.paymentMode === "cash" ? "#86efac" : "#fdba74";

  return `
  <div class="invoice" style="
    width: 794px;
    box-sizing: border-box;
    padding: 28px 32px;
    background: #ffffff;
    color: #111827;
    font-family: 'Inter', 'Noto Sans', 'Noto Sans Devanagari', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    word-spacing: 2px;
    letter-spacing: 0.01em;
  ">
    <style>
      .invoice .td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
      .invoice .th { border: 1px solid #d1d5db; padding: 6px 8px; background: #f3f4f6; font-weight: 600; }
      .invoice .l { text-align: left; }
      .invoice .r { text-align: right; }
      .invoice .c { text-align: center; }
      .invoice .row-line { margin-top: 2px; }
      .invoice table { border-collapse: collapse; width: 100%; }
      .invoice .muted { color: #6b7280; }
    </style>

    <!-- Header strip -->
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:18px;">
      <div>${brandWordmarkHtml(d.language)}</div>
      <div style="text-align:right;">
        <div style="font-weight:700; font-size:14px;">${escapeHtml(d.labels.taxInvoice)}</div>
        <div class="muted" style="font-size:12px;">${escapeHtml(d.labels.originalForRecipient)}</div>
      </div>
    </div>

    <!-- Seller / Buyer block -->
    <div style="display:flex; gap:24px; margin-bottom:18px;">
      <div style="flex:1;">
        <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(d.labels.soldBy)}</div>
        <div style="font-weight:600;">${escapeHtml(d.sellerName)}</div>
        ${sellerLines.map((l) => `<div class="row-line">${escapeHtml(l)}</div>`).join("")}
        ${panRow ? `<div style="margin-top:8px;">${panRow}</div>` : ""}
        ${gstRow}
        <div style="margin-top:12px;"><strong>${escapeHtml(d.labels.orderNumber)}</strong>&nbsp;${escapeHtml(d.orderNumber)}</div>
        <div><strong>${escapeHtml(d.labels.orderDate)}</strong>&nbsp;${escapeHtml(d.orderDate)}</div>
      </div>
      <div style="flex:1; text-align:right;">
        <div style="font-weight:700; margin-bottom:4px;">${escapeHtml(d.labels.billingAddress)}</div>
        ${buyerLines.map((l) => `<div class="row-line">${escapeHtml(l)}</div>`).join("")}
        <div style="margin-top:12px;"><strong>${escapeHtml(d.labels.invoiceNumber)}</strong>&nbsp;${escapeHtml(d.invoiceNumber)}</div>
        <div><strong>${escapeHtml(d.labels.invoiceDate)}</strong>&nbsp;${escapeHtml(d.invoiceDate)}</div>
      </div>
    </div>

    <!-- Line table -->
    <table>
      <thead>
        <tr>
          <th class="th c" style="width:32px;">${escapeHtml(d.labels.slNo)}</th>
          <th class="th l">${escapeHtml(d.labels.description)}</th>
          <th class="th r">${escapeHtml(d.labels.unitPrice)}</th>
          <th class="th r">${escapeHtml(d.labels.discount)}</th>
          <th class="th c">${escapeHtml(d.labels.qty)}</th>
          <th class="th r">${escapeHtml(d.labels.netAmount)}</th>
          <th class="th r">${escapeHtml(d.labels.taxRate)}</th>
          <th class="th c">${escapeHtml(d.labels.taxType)}</th>
          <th class="th r">${escapeHtml(d.labels.taxAmount)}</th>
          <th class="th r">${escapeHtml(d.labels.total)}</th>
        </tr>
      </thead>
      <tbody>
        ${lineRowHtml("1", d.product, d.labels)}
        ${lineRowHtml("2", d.shipping, d.labels)}
        <tr>
          <td class="td r" colSpan="8" style="font-weight:700; background:#f9fafb;">${escapeHtml(d.labels.totalRow)}</td>
          <td class="td r" style="font-weight:700; background:#f9fafb;">${escapeHtml(moneyRupee(d.totals.taxAmount))}</td>
          <td class="td r" style="font-weight:700; background:#f9fafb;">${escapeHtml(moneyRupee(d.totals.totalAmount))}</td>
        </tr>
      </tbody>
    </table>

    <!-- Amount in words + payment mode -->
    <div style="display:flex; gap:24px; align-items:center; justify-content:space-between; margin-top:14px; border:1px solid #d1d5db; padding:10px 12px; background:#f9fafb;">
      <div style="flex:1;">
        <div class="muted" style="font-weight:600;">${escapeHtml(d.labels.amountInWords)}</div>
        <div style="font-weight:600; margin-top:2px;">${escapeHtml(d.amountInWords)}</div>
      </div>
      <div style="text-align:right;">
        <span style="
          display:inline-block;
          padding:4px 10px;
          border-radius:9999px;
          font-weight:600;
          color:${paymentColor};
          background:${paymentBg};
          border:1px solid ${paymentBorder};
        ">
          ${escapeHtml(d.labels.paymentMode)}&nbsp;${escapeHtml(paymentLabel)}
        </span>
      </div>
    </div>

    <!-- Signature block -->
    <div style="display:flex; justify-content:flex-end; margin-top:28px;">
      <div style="text-align:right; min-width:260px;">
        <div style="font-weight:700;">${escapeHtml(d.labels.forLabel)}&nbsp;${escapeHtml(d.signatoryName)}:</div>
        <div style="height:48px;"></div>
        <div style="font-weight:700;">${escapeHtml(d.labels.authorisedSignatory)}</div>
      </div>
    </div>

    <!-- Disclaimer + thank you -->
    <div style="margin-top:24px; padding-top:10px; border-top:1px dashed #d1d5db; text-align:center;" class="muted">
      <em>${escapeHtml(d.labels.noSignatureRequired)}</em>
    </div>
    <div style="margin-top:8px; text-align:center; font-size:14px; font-weight:700; color:#374151;">
      ${escapeHtml(d.labels.thankYou)}
    </div>
  </div>
  `;
}

export async function renderBillPdf(data: BillPdfData): Promise<Blob> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.style.background = "#ffffff";
  host.innerHTML = buildInvoiceHtml(data);
  document.body.appendChild(host);
  try {
    // Wait for all fonts — especially Noto Sans Devanagari — to be fully loaded
    // and shaped before html2canvas captures the DOM. Without this, complex
    // Devanagari conjunct consonants render with the fallback font and appear
    // garbled (e.g. हस्ताक्षरकर्ता → हस्साक्करता).
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 12px "Noto Sans Devanagari"'),
      document.fonts.load('700 12px "Noto Sans Devanagari"'),
    ]);

    const node = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    let imgW = pdfW;
    let imgH = (canvas.height / canvas.width) * pdfW;
    // Scale to fit a single page if needed (invoice is short — should fit).
    if (imgH > pdfH) {
      const k = pdfH / imgH;
      imgW *= k;
      imgH = pdfH;
    }
    const x = (pdfW - imgW) / 2;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, 0, imgW, imgH);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(host);
  }
}

// Indian-English amount-in-words (e.g. 1099 -> "One Thousand Ninety-Nine only").
// `number-to-words` produces lowercase; we capitalise each word for the bill.
export function amountInWordsEn(amount: number): string {
  const rounded = Math.max(0, Math.round(amount));
  const words = numberToWords.toWords(rounded);
  const cased = words
    .split(" ")
    .map((w) => w.split("-").map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s)).join("-"))
    .join(" ");
  return `${cased} only`;
}
