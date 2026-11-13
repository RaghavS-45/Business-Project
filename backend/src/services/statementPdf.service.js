import PDFDocument from "pdfkit";

/**
 * Customer statement PDF (A4): opening balance, every invoice / payment /
 * credit note / refund with a running balance, closing balance, and the
 * invoices still unpaid.
 *
 * The built-in PDF fonts have no ₹ glyph, so amounts use "Rs.".
 */

const M = 36;
const W = 595.28 - M * 2;
const H = 841.89;
const GREY = "#666666";
const LINE = "#cccccc";
const money = (v) =>
  (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) =>
  new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

const TYPE_LABEL = { INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", REFUND: "Refund" };

export function renderStatementPdf(ledger, store = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: M, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, ledger, store);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function draw(doc, ledger, store) {
  const c = ledger.customer;
  const sellerName = store.tradeName || store.legalName || process.env.STORE_NAME || "Your Business Name";

  doc.font("Helvetica-Bold").fontSize(15).text("STATEMENT OF ACCOUNT", M, M, { width: W, align: "center" });
  let y = M + 28;

  const half = W / 2 - 8;
  doc.font("Helvetica-Bold").fontSize(11).text(sellerName, M, y, { width: half });
  doc.font("Helvetica").fontSize(8);
  if (store.address) doc.text(store.address, { width: half });
  if (store.gstin) doc.text(`GSTIN: ${store.gstin}`, { width: half });
  if (store.phone) doc.text(`Ph: ${store.phone}`, { width: half });
  const leftBottom = doc.y;

  const rx = M + W / 2 + 8;
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text("TO", rx, y);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(c.name, rx, doc.y, { width: half });
  doc.font("Helvetica").fontSize(8);
  if (c.gstin) doc.text(`GSTIN: ${c.gstin}`, rx, doc.y, { width: half });
  if (c.phone) doc.text(`Ph: ${c.phone}`, rx, doc.y, { width: half });
  const period = ledger.period?.from
    ? `${day(ledger.period.from)} – ${day(ledger.period.to ?? new Date())}`
    : `Up to ${day(ledger.period?.to ?? new Date())}`;
  doc.text(`Period: ${period}`, rx, doc.y, { width: half });
  doc.text(`Generated: ${day(new Date())}`, rx, doc.y, { width: half });

  y = Math.max(leftBottom, doc.y) + 12;

  // Summary strip
  const boxes = [
    ["Opening balance", ledger.opening],
    ["Closing balance", ledger.closing],
    ["Overdue now", ledger.overdue],
  ];
  const bw = W / boxes.length;
  boxes.forEach(([label, value], i) => {
    const x = M + i * bw;
    doc.rect(x, y, bw - 6, 38).fill("#f1f3f5");
    doc.fillColor(GREY).font("Helvetica").fontSize(7.5).text(label, x + 8, y + 7, { width: bw - 22 });
    doc.fillColor("black").font("Helvetica-Bold").fontSize(11).text(`Rs. ${money(value)}`, x + 8, y + 19, { width: bw - 22 });
  });
  y += 50;

  // Ledger table
  const cols = [
    ["Date", 62, "left"],
    ["Type", 58, "left"],
    ["Reference", 100, "left"],
    ["Details", 125, "left"],
    ["Debit", 59, "right"],
    ["Credit", 59, "right"],
    ["Balance", W - 463, "right"],
  ];
  const row = (cells, rowY, { bold = false, fill = null } = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
    const h = Math.max(...cols.map(([, w], i) => doc.heightOfString(String(cells[i] ?? ""), { width: w - 6 }))) + 8;
    if (fill) doc.rect(M, rowY, W, h).fill(fill);
    doc.fillColor("black");
    let x = M;
    cols.forEach(([, w, align], i) => {
      doc.text(String(cells[i] ?? ""), x + 3, rowY + 4, { width: w - 6, align });
      x += w;
    });
    doc.moveTo(M, rowY + h).lineTo(M + W, rowY + h).strokeColor(LINE).lineWidth(0.5).stroke();
    return rowY + h;
  };
  const header = cols.map(([h]) => h);
  y = row(header, y, { bold: true, fill: "#f1f3f5" });
  y = row(["", "", "", "Opening balance", "", "", money(ledger.opening)], y, { bold: true });
  for (const e of ledger.entries) {
    if (y > H - 110) {
      doc.addPage();
      y = row(header, M, { bold: true, fill: "#f1f3f5" });
    }
    y = row(
      [
        day(e.date),
        TYPE_LABEL[e.type] ?? e.type,
        e.ref,
        e.description,
        e.debit ? money(e.debit) : "",
        e.credit ? money(e.credit) : "",
        money(e.balance),
      ],
      y
    );
  }
  y = row(["", "", "", "Closing balance", "", "", money(ledger.closing)], y, { bold: true });

  // Unpaid invoices
  if (ledger.openInvoices?.length) {
    y += 14;
    if (y > H - 140) {
      doc.addPage();
      y = M;
    }
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("UNPAID INVOICES", M, y);
    y = doc.y + 4;
    doc.font("Helvetica").fontSize(8).fillColor("black");
    for (const inv of ledger.openInvoices) {
      const late = inv.daysOverdue > 0 ? `${inv.daysOverdue} days overdue` : inv.dueDate ? `due ${day(inv.dueDate)}` : "";
      doc.text(`${inv.invoiceNumber}   ${day(inv.createdAt)}   ${late}`, M, y, { width: W - 120, continued: false });
      doc.text(`Rs. ${money(inv.balanceDue)}`, M + W - 120, y, { width: 120, align: "right" });
      y = doc.y + 2;
    }
  }

  y += 16;
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text(
    "Positive balance = amount payable to us. Please report any discrepancy within 7 days.",
    M,
    y,
    { width: W }
  );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor(GREY).text(
      `Statement for ${c.name}   Page ${i + 1} of ${range.count}`,
      M,
      H - M - 8,
      { width: W, align: "center", lineBreak: false }
    );
  }
}
