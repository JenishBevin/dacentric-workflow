import { jsPDF } from "jspdf";
import { format } from "date-fns";
import qplusLogo from "../assets/QPlus.png";
import qplusStamp from "../assets/qplus-company-stamp.png";
import { COMPANY, LOGO_ASPECT, LOGO_WIDTH_MM, toDataUrl } from "./quotationPdf";

// Colors lifted directly from the company's own reference LPO PDF (sampled
// from its content stream's fill operators), not eyeballed.
const BLUE: [number, number, number] = [57, 105, 173];
const LIGHT_GRAY: [number, number, number] = [217, 217, 217];
const COMPANY_TRN = "100598993200003";
const VAT_RATE = 5;

export const DEFAULT_PO_COMMENTS = ["Payment Terms : To be discussed.", "Material Delivery: Immediate."].join("\n");

export interface PurchaseOrderLineItem {
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrderPdfInput {
  lpoNo: string;
  date: string | null; // ISO date
  requestedBy: string;
  customerId: string;
  projectName: string;
  vendorName: string;
  vendorAddress: string;
  lineItems: PurchaseOrderLineItem[];
  generalComments: string;
  quoteRefNo: string;
  preparerName: string;
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Renders the company's Purchase Order (LPO) — matching the company's own
 * reference template exactly (banner blue, item table, VAT/grand-total
 * box, general comments, signature + stamp). Reuses the same Items/
 * materials list Procurement already tracks (now carrying an optional
 * `unit`) rather than a separate item list. */
export async function generatePurchaseOrderPdf(input: PurchaseOrderPdfInput, opts?: { preview?: boolean; previewWindow?: Window | null }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginX = 15;
  const contentRight = pageWidth - marginX;
  const contentWidth = contentRight - marginX;

  // --- Header: logo + address left, title + TRN + LPO No./Date right ---
  let y = 15;
  try {
    const logoDataUrl = await toDataUrl(qplusLogo);
    const logoW = LOGO_WIDTH_MM * 0.62;
    const logoH = logoW * LOGO_ASPECT;
    doc.addImage(logoDataUrl, "PNG", marginX, y, logoW, logoH, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the logo rather than blocking the download.
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(140, 140, 140);
  doc.text("PURCHASE ORDER", contentRight, y + 8, { align: "right" });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(9.5);
  doc.text(`TRN : ${COMPANY_TRN}`, contentRight, y + 18, { align: "right" });

  const bannerW = 70;
  const bannerX = contentRight - bannerW;
  function labeledBanner(topY: number, label: string, value: string) {
    doc.setFillColor(...BLUE);
    doc.rect(bannerX, topY, bannerW, 6.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(label, bannerX + bannerW / 2, topY + 4.3, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(bannerX, topY + 6.2, bannerW, 7, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(value, bannerX + bannerW / 2, topY + 10.9, { align: "center" });
    doc.setFont("helvetica", "normal");
    return topY + 6.2 + 7;
  }
  let bannerY = y + 23;
  bannerY = labeledBanner(bannerY, "LPO NO #", input.lpoNo || "");
  bannerY += 4;
  bannerY = labeledBanner(bannerY, "DATE", input.date ? format(new Date(input.date), "dd/MM/yyyy") : "");

  // --- Address block, left, under the logo ---
  doc.setFontSize(8.3);
  doc.setFont("helvetica", "normal");
  let addrY = y + 24;
  for (const line of COMPANY.addressLines) {
    doc.text(line, marginX, addrY);
    addrY += 4.3;
  }
  doc.text(`Mob : ${COMPANY.mobile.replace("+971 ", "+971- ").replace(/\s+/g, "")}`, marginX, addrY);
  addrY += 4.3;
  doc.text(`Email : ${COMPANY.email}`, marginX, addrY);
  addrY += 4.3;
  doc.text(COMPANY.website, marginX, addrY);

  y = Math.max(addrY, bannerY) + 8;

  // --- Requested By / Customer ID / Project Name ---
  const triCols = [{ w: contentWidth / 3 }, { w: contentWidth / 3 }, { w: contentWidth / 3 }];
  const triLabels = ["REQUESTED BY", "CUSTOMER ID", "PROJECT NAME"];
  const triValues = [input.requestedBy, input.customerId, input.projectName];
  let tx = marginX;
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(marginX, y, contentWidth, 6, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(marginX, y, contentWidth, 6, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  triLabels.forEach((label, i) => {
    doc.text(label, tx + triCols[i].w / 2, y + 4, { align: "center" });
    tx += triCols[i].w;
  });
  y += 6;
  tx = marginX;
  doc.rect(marginX, y, contentWidth, 7, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  triValues.forEach((val, i) => {
    doc.text(val || "", tx + triCols[i].w / 2, y + 4.8, { align: "center" });
    if (i < 2) doc.line(tx + triCols[i].w, y, tx + triCols[i].w, y + 7);
    tx += triCols[i].w;
  });
  y += 7 + 8;

  // --- Bill To ---
  doc.setFillColor(...BLUE);
  doc.rect(marginX, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("BILL TO", marginX + 2, y + 4.2);
  doc.setTextColor(0, 0, 0);
  y += 6;
  const billLines = [input.vendorName, input.vendorAddress].filter(Boolean);
  const billBoxH = Math.max(12, billLines.length * 4.5 + 4);
  doc.setDrawColor(0, 0, 0);
  doc.rect(marginX, y, contentWidth, billBoxH, "S");
  doc.setFontSize(9.5);
  let billY = y + 5;
  billLines.forEach((line, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.text(line, marginX + 2, billY);
    billY += 4.5;
  });
  doc.setFont("helvetica", "normal");
  y += billBoxH + 8;

  // --- Item table ---
  const cols = [
    { label: "SL.NO.", width: 14 },
    { label: "DESCRIPTION", width: 74 },
    { label: "QTY", width: 18 },
    { label: "UNIT", width: 18 },
    { label: "UNIT PRICE", width: 28 },
    { label: "TOTAL PRICE", width: 28 },
  ];
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  const colX: number[] = [];
  let cx = marginX;
  for (const c of cols) {
    colX.push(cx);
    cx += c.width;
  }
  const colEdges = [...colX, marginX + tableWidth];

  function drawRowGrid(rowTop: number, rowHeight: number) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(marginX, rowTop, marginX + tableWidth, rowTop);
    doc.line(marginX, rowTop + rowHeight, marginX + tableWidth, rowTop + rowHeight);
    for (const edge of colEdges) doc.line(edge, rowTop, edge, rowTop + rowHeight);
  }

  doc.setFillColor(...BLUE);
  doc.rect(marginX, y, tableWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  cols.forEach((c, i) => doc.text(c.label, colX[i] + c.width / 2, y + 5, { align: "center" }));
  doc.setTextColor(0, 0, 0);
  drawRowGrid(y, 8);
  y += 8;
  doc.setFont("helvetica", "normal");

  const items = input.lineItems.filter((it) => it.description.trim());
  const rows = items.length > 0 ? items : [{ description: "", unit: "", quantity: "" as any, unitCost: "" as any }];
  let subtotal = 0;
  rows.forEach((item, idx) => {
    // Measure at the same size the row actually renders at (set below) —
    // otherwise a borderline-length description can be judged as fitting on
    // one line at the smaller size still active here, then overflow the
    // column once it's actually drawn at the real, larger render size.
    doc.setFontSize(8.5);
    const descLines = doc.splitTextToSize(item.description || "", cols[1].width - 4) as string[];
    const rowHeight = Math.max(8, descLines.length * 4 + 3);
    if (y + rowHeight > 255) {
      doc.addPage();
      y = 20;
    }
    const rowTop = y;
    const lineTotal = item.quantity === "" ? 0 : Number(item.quantity) * Number(item.unitCost);
    subtotal += lineTotal;
    doc.text(items.length > 0 ? String(idx + 1) : "", colX[0] + cols[0].width / 2, rowTop + 5, { align: "center" });
    doc.text(descLines, colX[1] + 2, rowTop + 5);
    doc.text(item.quantity === "" ? "" : String(item.quantity), colX[2] + cols[2].width / 2, rowTop + 5, { align: "center" });
    doc.text(item.unit || "", colX[3] + cols[3].width / 2, rowTop + 5, { align: "center" });
    doc.text(item.quantity === "" ? "" : money(Number(item.unitCost)), colX[4] + cols[4].width - 2, rowTop + 5, { align: "right" });
    doc.text(item.quantity === "" ? "" : money(lineTotal), colX[5] + cols[5].width - 2, rowTop + 5, { align: "right" });
    drawRowGrid(rowTop, rowHeight);
    y = rowTop + rowHeight;
  });

  // --- Totals box, under the rightmost two columns ---
  const vatAmount = (subtotal * VAT_RATE) / 100;
  const grandTotal = subtotal + vatAmount;
  const totalsX = colX[4];
  const totalsW = cols[4].width + cols[5].width;
  const totalsRows: [string, string, boolean][] = [
    ["TOTAL AED", money(subtotal), false],
    [`VAT  ${VAT_RATE}%`, vatAmount.toFixed(3), false],
    ["GRAND TOTAL\nAED", money(grandTotal), true],
  ];
  if (y + totalsRows.length * 8 > 270) {
    doc.addPage();
    y = 20;
  }
  for (const [label, value, highlight] of totalsRows) {
    const rowH = label.includes("\n") ? 10 : 8;
    if (highlight) {
      doc.setFillColor(...BLUE);
      doc.rect(totalsX, y, totalsW, rowH, "F");
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setFillColor(245, 245, 245);
      doc.rect(totalsX, y, cols[4].width, rowH, "F");
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(totalsX, y, cols[4].width, rowH, "S");
    doc.rect(colX[5], y, cols[5].width, rowH, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const labelLines = label.split("\n");
    labelLines.forEach((l, li) => doc.text(l, totalsX + cols[4].width / 2, y + rowH / 2 + (li - (labelLines.length - 1) / 2) * 3.6 + 1.2, { align: "center" }));
    doc.text(value, colX[5] + cols[5].width / 2, y + rowH / 2 + 1.2, { align: "center" });
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    y += rowH;
  }
  y += 10;

  // --- General comments ---
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(marginX, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("GENERAL COMMENTS", marginX + 2, y + 4.2);
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);
  const commentLines = input.generalComments.split("\n").filter((l) => l.trim());
  if (input.quoteRefNo.trim()) commentLines.push(`Quote Ref No: ${input.quoteRefNo.trim()}`);
  commentLines.forEach((line, i) => {
    doc.text(`${i + 1}. ${line.trim()}`, marginX, y);
    y += 4.8;
  });
  y += 10;

  // --- Signature + stamp ---
  if (y > 245) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(9.5);
  doc.setTextColor(100, 100, 100);
  doc.text("Thanks & Regards,", marginX + 20, y);
  doc.setTextColor(0, 0, 0);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text(input.preparerName || "", marginX + 20, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  doc.text("Q Plus Technical Service LLC", marginX + 20, y);

  try {
    const stampDataUrl = await toDataUrl(qplusStamp);
    const stampSize = 26;
    doc.addImage(stampDataUrl, "PNG", marginX + 95, y - 28, stampSize, stampSize, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the stamp rather than blocking the download.
  }
  y += 20;

  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(10.5);
  doc.setTextColor(...BLUE);
  doc.text("Thank You For Your Business!!!", pageWidth / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");

  const fileSafe = (input.lpoNo || "purchase-order").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `purchase-order-${fileSafe}.pdf`;
  if (opts?.preview) {
    const target = opts.previewWindow ?? window.open("", "_blank");
    if (target) target.location.href = doc.output("bloburl").toString();
  } else {
    doc.save(filename);
  }
}
