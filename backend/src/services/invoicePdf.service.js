import PDFDocument from "pdfkit";
import { GST_STATES, amountInWords } from "../utils/gst.js";

/**
 * A4 GST tax invoice for a sale.
 *
 * Everything printed comes from the sale itself (including the seller and
 * buyer snapshots), so re-printing an old invoice always shows exactly what
 * was issued, even if store or customer details changed since.
 *
 * Note: the built-in PDF fonts have no ₹ glyph, so amounts use "Rs.".
 */

const PAGE = { width: 595.28, height: 841.89, margin: 36 };
const CONTENT_W = PAGE.width - PAGE.margin * 2;
const GREY = "#666666";
const LINE = "#cccccc";

const money = (v) =>
  (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => `${+(Number(v) || 0).toFixed(2)}%`;
const stateLabel = (code) => (code && GST_STATES[code] ? `${GST_STATES[code]} (${code})` : "—");

const formatDate = (d) =>
  new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Group line items by GST rate for the tax summary table.
 */
function taxSummary(items) {
  const byRate = new Map();
  for (const it of items) {
    const key = it.taxPercent ?? 0;
    const row = byRate.get(key) ?? { rate: key, hsn: new Set(), taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    if (it.hsnCode) row.hsn.add(it.hsnCode);
    // Work in paise so the summary adds up exactly
    row.taxable += Math.round((it.taxableValue ?? 0) * 100);
    row.cgst += Math.round((it.cgst ?? 0) * 100);
    row.sgst += Math.round((it.sgst ?? 0) * 100);
    row.igst += Math.round((it.igst ?? 0) * 100);
    byRate.set(key, row);
  }
  return [...byRate.values()]
    .sort((a, b) => a.rate - b.rate)
    .map((r) => ({
      rate: r.rate,
      hsn: [...r.hsn].join(", ") || "—",
      taxable: r.taxable / 100,
      cgst: r.cgst / 100,
      sgst: r.sgst / 100,
      igst: r.igst / 100,
    }));
}

/**
 * Render a sale to a PDF buffer.
 * @param {Object} sale - Sale document (customer/cashier may be populated)
 * @returns {Promise<Buffer>}
 */
export function renderInvoicePdf(sale) {
  return renderPdf(sale, {
    title: "TAX INVOICE",
    number: sale.invoiceNumber,
    meta: [
      ["Invoice No.", sale.invoiceNumber],
      ["Invoice Date", formatDate(sale.createdAt)],
    ],
    trailingMeta: [["Payment", sale.paymentMethod]],
    totalLabel: "Invoice total",
    total: sale.grandTotal,
    showGross: true,
    stamp:
      sale.status === "REFUNDED"
        ? "REFUNDED"
        : sale.status === "PARTIALLY_RETURNED"
          ? `PARTLY RETURNED (Rs. ${money(sale.returnedTotal)})`
          : null,
    notes: sale.notes,
    docName: "invoice",
    paymentFooter: true,
  });
}

/**
 * Render a credit note (goods returned against an invoice) to a PDF buffer.
 * Uses the same layout as the invoice, with the credit note's own lines.
 */
export function renderCreditNotePdf(cn) {
  return renderPdf(cn, {
    title: "CREDIT NOTE",
    number: cn.creditNoteNumber,
    meta: [
      ["Credit Note No.", cn.creditNoteNumber],
      ["Date", formatDate(cn.createdAt)],
      ["Against Invoice", `${cn.invoiceNumber} (${formatDate(cn.invoiceDate).split(",")[0]})`],
    ],
    trailingMeta: [["Refund via", cn.refundMethod]],
    totalLabel: "Credit note total",
    total: cn.total,
    showGross: false,
    stamp: null,
    notes: `Reason for return: ${cn.reason}`,
    docName: "credit note",
    paymentFooter: false, // bank details / payment terms don't apply to a refund
  });
}

const shortDate = (d) => formatDate(d).split(",")[0];

/** Quotation: priced like the invoice it would become; no payment details. */
export function renderQuotationPdf(q) {
  return renderPdf(q, {
    title: "QUOTATION",
    number: q.quoteNumber,
    meta: [
      ["Quotation No.", q.quoteNumber],
      ["Date", formatDate(q.createdAt)],
      ["Valid Until", shortDate(q.validUntil)],
    ],
    trailingMeta: [],
    partyLabel: "QUOTATION FOR",
    totalLabel: "Quoted total",
    total: q.grandTotal,
    showGross: true,
    stamp: q.status === "DECLINED" ? "DECLINED" : null,
    notes: [q.notes, "Prices are valid until the date above and subject to stock availability."].filter(Boolean).join("\n"),
    docName: "quotation",
    paymentFooter: true, // bank details and terms help the buyer plan payment
  });
}

/** Delivery challan: goods sent, with their value (needed for the e-way bill). */
export function renderChallanPdf(c) {
  const transport = [c.vehicleNumber && `Vehicle ${c.vehicleNumber}`, c.transporter].filter(Boolean).join(" · ");
  return renderPdf(c, {
    title: "DELIVERY CHALLAN",
    number: c.challanNumber,
    meta: [
      ["Challan No.", c.challanNumber],
      ["Date", formatDate(c.createdAt)],
      ...(c.quoteNumber ? [["Against Quote", c.quoteNumber]] : []),
      ...(transport ? [["Transport", transport]] : []),
    ],
    trailingMeta: [["Purpose", "Supply (invoice to follow)"]],
    partyLabel: "CONSIGNEE",
    totalLabel: "Value of goods",
    total: c.grandTotal,
    showGross: false,
    stamp: c.status === "CANCELLED" ? "CANCELLED" : c.status === "INVOICED" ? `INVOICED (${c.invoiceNumber})` : null,
    notes: [c.deliveryAddress && `Deliver to: ${c.deliveryAddress}`, c.notes, "Received the above goods in good condition.  Receiver's signature: ____________"]
      .filter(Boolean)
      .join("\n"),
    docName: "delivery challan",
    paymentFooter: false,
  });
}

function renderPdf(sale, opts) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      draw(doc, sale, opts);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function draw(doc, sale, opts) {
  const L = PAGE.margin;
  const R = PAGE.width - PAGE.margin;
  const seller = sale.seller ?? {};
  const buyer = sale.buyer ?? {};
  const inter = Boolean(sale.interState);

  // ─── Title ───────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(15).fillColor("black").text(opts.title, L, L, { width: CONTENT_W, align: "center" });
  doc.font("Helvetica").fontSize(7).fillColor(GREY).text("Original for Recipient", L, L + 4, { width: CONTENT_W, align: "right" });
  if (opts.stamp) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#c62828").text(opts.stamp, L, L + 4);
  }

  // ─── Seller (left) and invoice details (right) ───────────
  let y = L + 28;
  const colW = CONTENT_W / 2 - 8;
  const sellerName = seller.tradeName || seller.legalName || process.env.STORE_NAME || "Your Business Name";

  doc.fillColor("black").font("Helvetica-Bold").fontSize(12).text(sellerName, L, y, { width: colW });
  if (seller.tradeName && seller.legalName && seller.legalName !== seller.tradeName) {
    doc.font("Helvetica").fontSize(8).fillColor(GREY).text(seller.legalName, { width: colW });
  }
  doc.font("Helvetica").fontSize(8).fillColor("black");
  if (seller.address) doc.text(seller.address, { width: colW });
  const contact = [seller.phone && `Ph: ${seller.phone}`, seller.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, { width: colW });
  doc.font("Helvetica-Bold").text(`GSTIN: ${seller.gstin || "Unregistered"}`, { width: colW });
  doc.font("Helvetica").text(`State: ${stateLabel(seller.stateCode)}`, { width: colW });
  const sellerBottom = doc.y;

  const metaX = L + CONTENT_W / 2 + 8;
  const meta = [
    ...opts.meta,
    ["Place of Supply", sale.placeOfSupply?.code ? stateLabel(sale.placeOfSupply.code) : stateLabel(seller.stateCode)],
    ["Supply Type", inter ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"],
    ["Reverse Charge", "No"],
    ...opts.trailingMeta,
  ];
  let my = y;
  for (const [k, v] of meta) {
    doc.font("Helvetica").fontSize(8).fillColor(GREY).text(k, metaX, my, { width: 80 });
    doc.font("Helvetica-Bold").fillColor("black").text(String(v ?? "—"), metaX + 82, my, { width: colW - 82 });
    my = doc.y + 2;
  }

  y = Math.max(sellerBottom, my) + 10;
  doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).lineWidth(0.7).stroke();

  // ─── Bill to ─────────────────────────────────────────────
  y += 8;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text(opts.partyLabel ?? "BILL TO", L, y);
  y = doc.y + 2;
  if (buyer.name) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("black").text(buyer.name, L, y, { width: CONTENT_W });
    doc.font("Helvetica").fontSize(8);
    if (buyer.address) doc.text(buyer.address, { width: CONTENT_W });
    if (buyer.phone) doc.text(`Ph: ${buyer.phone}`);
    doc.font("Helvetica-Bold").text(`GSTIN: ${buyer.gstin || "Unregistered"}`);
    doc.font("Helvetica").text(`State: ${stateLabel(buyer.stateCode || sale.placeOfSupply?.code)}`);
  } else {
    doc.font("Helvetica").fontSize(9).fillColor("black").text("Cash sale (walk-in customer)", L, y);
  }
  y = doc.y + 10;

  // ─── Items table ─────────────────────────────────────────
  const cols = [
    { key: "n", label: "#", w: 18, align: "left" },
    { key: "name", label: "Item", w: 106, align: "left" },
    { key: "hsn", label: "HSN", w: 44, align: "left" },
    { key: "qty", label: "Qty", w: 48, align: "right" },
    { key: "rate", label: "Rate", w: 54, align: "right" },
    { key: "disc", label: "Disc", w: 44, align: "right" },
    { key: "taxable", label: "Taxable", w: 62, align: "right" },
    { key: "gst", label: "GST", w: 30, align: "right" },
    { key: "tax", label: inter ? "IGST" : "CGST+SGST", w: 56, align: "right" },
    { key: "total", label: "Amount", w: 61, align: "right" },
  ];
  const drawRow = (cells, rowY, { bold = false, fill = null } = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
    const height =
      Math.max(...cols.map((c) => doc.heightOfString(String(cells[c.key] ?? ""), { width: c.w - 6 }))) + 8;
    if (fill) doc.rect(L, rowY, CONTENT_W, height).fill(fill);
    let x = L;
    doc.fillColor("black");
    for (const c of cols) {
      doc.text(String(cells[c.key] ?? ""), x + 3, rowY + 4, { width: c.w - 6, align: c.align });
      x += c.w;
    }
    doc.moveTo(L, rowY + height).lineTo(R, rowY + height).strokeColor(LINE).lineWidth(0.5).stroke();
    return rowY + height;
  };
  const header = Object.fromEntries(cols.map((c) => [c.key, c.label]));

  y = drawRow(header, y, { bold: true, fill: "#f1f3f5" });
  sale.items.forEach((it, i) => {
    if (y > PAGE.height - 120) {
      doc.addPage();
      y = drawRow(header, PAGE.margin, { bold: true, fill: "#f1f3f5" });
    }
    y = drawRow(
      {
        n: i + 1,
        // "Basmati Rice (bag of 25 kg)"
        name:
          it.unitSize && it.unitSize !== 1
            ? `${it.name} (${it.unit} of ${it.unitSize}${it.baseUnit ? ` ${it.baseUnit}` : ""})`
            : it.name,
        hsn: it.hsnCode || "—",
        // "2 carton", "2.5 kg"
        qty: it.unit ? `${it.quantity} ${it.unit}` : it.quantity,
        rate: money(it.unitPrice),
        disc: (() => {
          // Item discount + loyalty discount for this line, as an amount
          const gross = Math.round(it.quantity * it.unitPrice * 100);
          const net = Math.round((sale.pricesIncludeTax ? it.lineTotal : it.taxableValue) * 100);
          return gross - net > 0 ? money((gross - net) / 100) : "—";
        })(),
        taxable: money(it.taxableValue),
        gst: pct(it.taxPercent),
        tax: money((it.cgst ?? 0) + (it.sgst ?? 0) + (it.igst ?? 0)),
        total: money(it.lineTotal),
      },
      y
    );
  });

  // ─── Tax summary (left) and totals (right) ───────────────
  y += 12;
  if (y > PAGE.height - 220) {
    doc.addPage();
    y = PAGE.margin;
  }
  const summary = taxSummary(sale.items);
  const sumCols = inter
    ? [["GST", 40], ["HSN", 70], ["Taxable", 70], ["IGST", 70]]
    : [["GST", 40], ["HSN", 60], ["Taxable", 60], ["CGST", 55], ["SGST", 55]];
  const sumW = sumCols.reduce((s, [, w]) => s + w, 0);

  doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("TAX SUMMARY", L, y);
  let sy = doc.y + 3;
  const drawSumRow = (vals, bold) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor("black");
    let x = L;
    vals.forEach((v, i) => {
      doc.text(String(v), x + 2, sy + 3, { width: sumCols[i][1] - 4, align: i < 2 ? "left" : "right" });
      x += sumCols[i][1];
    });
    sy += 15;
    doc.moveTo(L, sy).lineTo(L + sumW, sy).strokeColor(LINE).lineWidth(0.5).stroke();
  };
  drawSumRow(sumCols.map(([h]) => h), true);
  for (const r of summary) {
    drawSumRow(
      inter
        ? [pct(r.rate), r.hsn, money(r.taxable), money(r.igst)]
        : [pct(r.rate), r.hsn, money(r.taxable), money(r.cgst), money(r.sgst)],
      false
    );
  }

  // Totals box
  const tx = L + CONTENT_W - 210;
  let ty = y;
  const totalRow = (label, value, { bold = false, big = false } = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(big ? 10 : 8).fillColor("black");
    doc.text(label, tx, ty, { width: 120 });
    doc.text(value, tx + 120, ty, { width: 90, align: "right" });
    ty = doc.y + 3;
  };
  const discounts = (sale.discountTotal ?? 0) + (sale.loyaltyDiscountTotal ?? 0);
  if (opts.showGross) {
    totalRow("Gross amount", `Rs. ${money(sale.subtotal)}`);
    if (discounts > 0) totalRow("Less: discounts", `- Rs. ${money(discounts)}`);
  }
  totalRow("Taxable value", `Rs. ${money(sale.taxableTotal)}`);
  if (inter) {
    totalRow("IGST", `Rs. ${money(sale.igstTotal)}`);
  } else {
    totalRow("CGST", `Rs. ${money(sale.cgstTotal)}`);
    totalRow("SGST", `Rs. ${money(sale.sgstTotal)}`);
  }
  if (sale.pricesIncludeTax) {
    doc.font("Helvetica").fontSize(7).fillColor(GREY).text("(prices include GST)", tx, ty, { width: 210, align: "right" });
    ty = doc.y + 3;
  }
  doc.moveTo(tx, ty).lineTo(R, ty).strokeColor("black").lineWidth(0.8).stroke();
  ty += 5;
  totalRow(opts.totalLabel, `Rs. ${money(opts.total)}`, { bold: true, big: true });

  y = Math.max(sy, ty) + 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("black").text("Amount in words: ", L, y, { continued: true });
  doc.font("Helvetica").text(amountInWords(opts.total), { width: CONTENT_W });
  y = doc.y + 14;

  // ─── Footer: bank details, terms, signature ──────────────
  if (y > PAGE.height - 120) {
    doc.addPage();
    y = PAGE.margin;
  }
  const footW = CONTENT_W / 2 - 10;
  let fy = y;
  if (opts.paymentFooter && seller.bankDetails) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("BANK DETAILS", L, fy);
    doc.font("Helvetica").fillColor("black").text(seller.bankDetails, { width: footW });
    fy = doc.y + 8;
  }
  if (opts.paymentFooter && seller.invoiceTerms) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("TERMS", L, fy);
    doc.font("Helvetica").fillColor("black").text(seller.invoiceTerms, { width: footW });
    fy = doc.y + 8;
  }
  if (opts.notes) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("NOTES", L, fy);
    doc.font("Helvetica").fillColor("black").text(opts.notes, { width: footW });
  }

  const sx = L + CONTENT_W / 2 + 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("black").text(`For ${sellerName}`, sx, y, { width: footW, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text("Authorised Signatory", sx, y + 40, { width: footW, align: "right" });

  // Page footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // let the footer sit inside the bottom margin without a page break
    doc.font("Helvetica").fontSize(7).fillColor(GREY).text(
      `This is a computer-generated ${opts.docName}.   ${opts.number}   Page ${i + 1} of ${range.count}`,
      L,
      PAGE.height - PAGE.margin - 8,
      { width: CONTENT_W, align: "center", lineBreak: false }
    );
  }
}
