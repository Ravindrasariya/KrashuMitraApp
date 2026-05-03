import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import numberToWords from "number-to-words";

// ---------------------------------------------------------------------------
// Inline-font helper
// ---------------------------------------------------------------------------
// html2canvas's `foreignObjectRendering: true` mode is the only way to get
// correct Devanagari ligature shaping (हस्ताक्षरकर्ता, प्रकार, क्र, etc.) —
// it uses an SVG <foreignObject>, which delegates text rendering back to the
// browser's native shaper. The catch: the resulting SVG is sandboxed and can
// only see same-origin font files. Our Noto Sans Devanagari is loaded from
// fonts.gstatic.com, so it is unavailable inside the SVG and the captured
// image comes out blank.
//
// Fix: fetch Google's font CSS once, inline every referenced .woff2 file as
// a base64 data: URL, and inject the rewritten @font-face block into the
// off-screen invoice container. The font is then "same-origin" (data: URLs
// have no origin restrictions inside foreignObject) and shaping works.
const FONTS_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&family=Inter:wght@400;600;700&display=swap";

let inlinedFontCssPromise: Promise<string> | null = null;
let inlinedFontCssReady = false;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

async function getInlinedFontCss(): Promise<string> {
  // Reuse a successful (non-empty) result; retry on failure so a transient
  // network/CSP error doesn't permanently degrade PDF rendering.
  if (inlinedFontCssReady && inlinedFontCssPromise) return inlinedFontCssPromise;
  if (inlinedFontCssPromise) return inlinedFontCssPromise;
  const attempt = (async () => {
    try {
      const cssRes = await fetch(FONTS_CSS_URL, { credentials: "omit" });
      if (!cssRes.ok) return "";
      let cssText = await cssRes.text();
      // Match url(...) with optional single/double quotes and any path that
      // contains .woff2 (handles ?query suffixes and quoted forms).
      const urlRegex = /url\(\s*['"]?(https:\/\/[^'")\s]+\.woff2[^'")\s]*)['"]?\s*\)/g;
      const urls = Array.from(
        new Set(Array.from(cssText.matchAll(urlRegex), (m) => m[1])),
      );
      if (urls.length === 0) return "";
      const pairs = await Promise.all(
        urls.map(async (u) => {
          try {
            const r = await fetch(u, { credentials: "omit" });
            if (!r.ok) return null;
            const buf = await r.arrayBuffer();
            return [u, `data:font/woff2;base64,${arrayBufferToBase64(buf)}`] as const;
          } catch {
            return null;
          }
        }),
      );
      let replacedAny = false;
      for (const pair of pairs) {
        if (!pair) continue;
        const [orig, dataUrl] = pair;
        cssText = cssText.split(orig).join(dataUrl);
        replacedAny = true;
      }
      if (!replacedAny) return "";
      inlinedFontCssReady = true;
      return cssText;
    } catch {
      return "";
    }
  })();
  inlinedFontCssPromise = attempt;
  const result = await attempt;
  // If the attempt failed, clear the cached promise so the next caller retries.
  if (!result) {
    inlinedFontCssPromise = null;
  }
  return result;
}

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

function buildInvoiceHtml(d: BillPdfData, inlinedFontCss = ""): string {
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
      ${inlinedFontCss}
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
  // Fetch + inline Noto Sans Devanagari (and Inter) as base64 data: URLs so
  // the SVG foreignObject renderer below can see the font without a
  // cross-origin fetch. Result is cached module-level — only fetched once.
  const inlinedFontCss = await getInlinedFontCss();

  // The @font-face rules MUST live INSIDE the .invoice node we capture —
  // html2canvas's foreignObject SVG only includes descendants of the node it
  // captures, so a sibling <style> tag would be left behind and the SVG would
  // render blank (this is exactly what happened in Firefox in Task #120).
  host.innerHTML = buildInvoiceHtml(data, inlinedFontCss);
  document.body.appendChild(host);
  try {
    // Belt-and-braces: also wait for the page-level fonts to be ready (the
    // inlined ones above register independently inside the host element).
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('400 12px "Noto Sans Devanagari"'),
      document.fonts.load('700 12px "Noto Sans Devanagari"'),
    ]);

    const node = host.querySelector(".invoice") as HTMLElement;
    // foreignObjectRendering uses SVG <foreignObject> which preserves the
    // browser's native text shaping engine (Harfbuzz). This is required for
    // complex Devanagari conjuncts containing half-र (हस्ताक्षरकर्ता,
    // प्रकार, क्र) — html2canvas's default canvas renderer draws glyphs
    // one-by-one without OpenType shaping and corrupts these ligatures.
    // The inlined data: URL @font-face above keeps the SVG from going blank.
    // Only enable foreignObjectRendering when the font inlining succeeded.
    // Otherwise the SVG foreignObject would have no font and produce a blank
    // capture. Falling back to the default canvas renderer means Devanagari
    // shaping degrades, but the PDF will still be readable.
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      foreignObjectRendering: inlinedFontCss.length > 0,
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
