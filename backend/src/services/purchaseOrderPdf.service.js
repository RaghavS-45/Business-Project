import PDFDocument from "pdfkit";
import { GST_STATES } from "../utils/gst.js";

/**
 * Purchase order PDF to send to the supplier: who is ordering, what, how
 * much (in the ordering unit), at what agreed cost, and when it's needed.
 * Amounts are before GST; the supplier's bill adds the tax.
 *
 * Built-in PDF fonts have no ₹ glyph, so amounts use "Rs.".
 */
const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const W = PAGE.width - PAGE.margin * 2;
const GREY = "#666666";
const LINE = "#cccccc";

const money = (v) => (Number(v) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (d) =>
  new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

export function renderPurchaseOrderPdf(po, store) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE.margin, bufferPages: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc, po, store);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function draw(doc, po, store) {
  const L = PAGE.margin;
  const R = PAGE.width - PAGE.margin;
  const buyerName = store.tradeName || store.legalName || process.env.STORE_NAME || "Your Business Name";
  const vendor = po.vendor ?? {};

  doc.font("Helvetica-Bold").fontSize(16).text("PURCHASE ORDER", L, L, { width: W, align: "center" });
  if (po.status === "rejected") doc.font("Helvetica-Bold").fontSize(9).fillColor("#c62828").text("CANCELLED", L, L + 4);

  // From (us) and order details
  let y = L + 32;
  const col = W / 2 - 10;
  doc.fillColor("black").font("Helvetica-Bold").fontSize(12).text(buyerName, L, y, { width: col });
  doc.font("Helvetica").fontSize(8.5);
  if (store.address) doc.text(store.address, { width: col });
  const contact = [store.phone && `Ph: ${store.phone}`, store.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, { width: col });
  if (store.gstin) doc.font("Helvetica-Bold").text(`GSTIN: ${store.gstin}`, { width: col });
  if (store.stateCode && GST_STATES[store.stateCode]) doc.font("Helvetica").text(`State: ${GST_STATES[store.stateCode]} (${store.stateCode})`);
  const leftBottom = doc.y;

  const mx = L + W / 2 + 10;
  let my = y;
  const meta = [
    ["PO No.", po.poNumber],
    ["Date", date(po.createdAt)],
    ["Deliver by", po.expectedDelivery ? date(po.expectedDelivery) : "As soon as possible"],
    ["Status", po.status.charAt(0).toUpperCase() + po.status.slice(1)],
  ];
  for (const [k, v] of meta) {
    doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text(k, mx, my, { width: 70 });
    doc.font("Helvetica-Bold").fillColor("black").text(String(v), mx + 72, my, { width: col - 72 });
    my = doc.y + 3;
  }

  y = Math.max(leftBottom, my) + 12;
  doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).lineWidth(0.7).stroke();

  // Supplier
  y += 8;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("TO SUPPLIER", L, y);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("black").text(vendor.name ?? "—", L, doc.y + 2, { width: W });
  doc.font("Helvetica").fontSize(8.5);
  if (vendor.contactPerson) doc.text(`Attn: ${vendor.contactPerson}`);
  const addr = vendor.address ? [vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.pincode].filter(Boolean).join(", ") : "";
  if (addr) doc.text(addr, { width: W });
  const vContact = [vendor.phone && `Ph: ${vendor.phone}`, vendor.email].filter(Boolean).join("  ·  ");
  if (vContact) doc.text(vContact);
  if (vendor.gstin) doc.text(`GSTIN: ${vendor.gstin}`);
  y = doc.y + 12;

  // Items
  const cols = [
    { key: "n", label: "#", w: 22, align: "left" },
    { key: "name", label: "Item", w: 205, align: "left" },
    { key: "sku", label: "SKU", w: 70, align: "left" },
    { key: "qty", label: "Quantity", w: 80, align: "right" },
    { key: "rate", label: "Rate", w: 66, align: "right" },
    { key: "amt", label: "Amount", w: W - 22 - 205 - 70 - 80 - 66, align: "right" },
  ];
  const row = (cells, rowY, { bold = false, fill = null } = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
    const h = Math.max(...cols.map((c) => doc.heightOfString(String(cells[c.key] ?? ""), { width: c.w - 6 }))) + 9;
    if (fill) doc.rect(L, rowY, W, h).fill(fill);
    let x = L;
    doc.fillColor("black");
    for (const c of cols) {
      doc.text(String(cells[c.key] ?? ""), x + 3, rowY + 4.5, { width: c.w - 6, align: c.align });
      x += c.w;
    }
    doc.moveTo(L, rowY + h).lineTo(R, rowY + h).strokeColor(LINE).lineWidth(0.5).stroke();
    return rowY + h;
  };
  const header = Object.fromEntries(cols.map((c) => [c.key, c.label]));
  y = row(header, y, { bold: true, fill: "#f1f3f5" });
  let totalP = 0;
  po.items.forEach((it, i) => {
    if (y > PAGE.height - 140) {
      doc.addPage();
      y = row(header, PAGE.margin, { bold: true, fill: "#f1f3f5" });
    }
    const amountP = Math.round(it.quantity * it.unitCost * 100);
    totalP += amountP;
    const packNote = it.unitSize && it.unitSize !== 1 ? ` (${it.unit} of ${it.unitSize})` : "";
    y = row(
      {
        n: i + 1,
        name: `${it.productName}${packNote}`,
        sku: it.productSku,
        qty: `${it.quantity} ${it.unit || ""}`.trim(),
        rate: money(it.unitCost),
        amt: money(amountP / 100),
      },
      y
    );
  });

  y += 8;
  doc.font("Helvetica-Bold").fontSize(10).text(`Total (before GST): Rs. ${money(totalP / 100)}`, L, y, { width: W, align: "right" });
  y = doc.y + 14;

  if (po.notes) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GREY).text("NOTES", L, y);
    doc.font("Helvetica").fontSize(9).fillColor("black").text(po.notes, { width: W });
    y = doc.y + 10;
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text(
    "Please quote this PO number on your invoice and delivery challan. GST as applicable will be paid on your tax invoice.",
    L,
    y,
    { width: W }
  );
  y = doc.y + 30;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("black").text(`For ${buyerName}`, L, y, { width: W, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(GREY).text("Authorised Signatory", L, y + 32, { width: W, align: "right" });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor(GREY).text(`${po.poNumber}   Page ${i + 1} of ${range.count}`, L, PAGE.height - PAGE.margin - 8, {
      width: W,
      align: "center",
      lineBreak: false,
    });
  }
}
