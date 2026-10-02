import { jsPDF } from "jspdf";
import { format } from "date-fns";
import qplusLogo from "../assets/QPlus.png";
import qplusStamp from "../assets/qplus-company-stamp.png";
import { COMPANY, LOGO_ASPECT, LOGO_WIDTH_MM, toDataUrl } from "./quotationPdf";

export interface DeliveryNoteLineItem {
  description: string;
  unit: string;
  qty: number;
}

export interface DeliveryNotePdfInput {
  noteNo: string;
  date: string | null; // ISO date
  site: string;
  location: string;
  lineItems: DeliveryNoteLineItem[];
  receiverName: string;
  receiverDesignation: string;
}

/** Renders the company's printed Delivery Note — a one-page handover slip
 * (site/location/date/no, an item table, receiver sign-off) — matching the
 * company's own reference template exactly. No pricing anywhere on this
 * document, unlike the quotation PDF it borrows its letterhead from. */
export async function generateDeliveryNotePdf(input: DeliveryNotePdfInput, opts?: { preview?: boolean; previewWindow?: Window | null }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginX = 15;
  const contentRight = pageWidth - marginX;
  let y = 15;

  // --- Header: logo left, company address block right, rule beneath ---
  try {
    const logoDataUrl = await toDataUrl(qplusLogo);
    const logoW = LOGO_WIDTH_MM * 0.62;
    const logoH = logoW * LOGO_ASPECT;
    doc.addImage(logoDataUrl, "PNG", marginX, y, logoW, logoH, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the logo rather than blocking the download.
  }

  doc.setFontSize(7.6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  let addrY = 17;
  const addressLines = [...COMPANY.addressLines, `Mob: ${COMPANY.mobile}`, `Email: ${COMPANY.email}`, COMPANY.website];
  for (const line of addressLines) {
    doc.text(line, contentRight, addrY, { align: "right" });
    addrY += 4;
  }
  doc.setTextColor(0, 0, 0);

  y = Math.max(y + 22, addrY + 4);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, contentRight, y);
  y += 12;

  // --- Title ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("DELIVERY NOTE", pageWidth / 2, y, { align: "center" });
  const titleWidth = doc.getTextWidth("DELIVERY NOTE");
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - titleWidth / 2, y + 1.2, pageWidth / 2 + titleWidth / 2, y + 1.2);
  y += 16;

  // --- Site/Date, Location/No — two-column label rows ---
  const col2X = pageWidth / 2 + 15;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Site:", marginX, y);
  doc.text("Date :", col2X, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.site || "", marginX + 12, y);
  doc.text(input.date ? format(new Date(input.date), "d MMM yyyy") : "", col2X + 14, y);
  y += 9;

  doc.setFont("helvetica", "bold");
  doc.text("Location :", marginX, y);
  doc.text("No :", col2X, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.location || "", marginX + 20, y);
  doc.text(input.noteNo || "", col2X + 10, y);
  y += 12;

  // --- Item table ---
  const cols = [
    { key: "sl", label: "SL.No.", width: 16 },
    { key: "desc", label: "DESCRIPTION AND SPECIFICATIONS", width: 118 },
    { key: "unit", label: "UNIT", width: 25 },
    { key: "qty", label: "QTY", width: 21 },
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
    doc.setLineWidth(0.25);
    doc.line(marginX, rowTop, marginX + tableWidth, rowTop);
    doc.line(marginX, rowTop + rowHeight, marginX + tableWidth, rowTop + rowHeight);
    for (const edge of colEdges) doc.line(edge, rowTop, edge, rowTop + rowHeight);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setFillColor(217, 217, 217);
  doc.rect(marginX, y, tableWidth, 9, "F");
  cols.forEach((c, i) => doc.text(c.label, colX[i] + c.width / 2, y + 5.5, { align: "center" }));
  drawRowGrid(y, 9);
  y += 9;
  doc.setFont("helvetica", "normal");

  const items = input.lineItems.length > 0 ? input.lineItems : [{ description: "", unit: "", qty: "" as any }];
  items.forEach((item, idx) => {
    // Measure at the same size the row actually renders at (set below) —
    // otherwise a borderline-length description can be judged as fitting on
    // one line at the smaller size still active here, then overflow the
    // column once it's actually drawn at the real, larger render size.
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(item.description || "", cols[1].width - 4) as string[];
    const rowHeight = Math.max(9, descLines.length * 4 + 3);
    if (y + rowHeight > 270) {
      doc.addPage();
      y = 20;
    }
    const rowTop = y;
    doc.text(String(idx + 1), colX[0] + cols[0].width / 2, rowTop + 5.5, { align: "center" });
    doc.text(descLines, colX[1] + 2, rowTop + 5.5);
    doc.text(item.unit || "", colX[2] + cols[2].width / 2, rowTop + 5.5, { align: "center" });
    doc.text(item.qty === "" ? "" : String(item.qty), colX[3] + cols[3].width / 2, rowTop + 5.5, { align: "center" });
    drawRowGrid(rowTop, rowHeight);
    y = rowTop + rowHeight;
  });
  y += 16;

  // --- Stamp (left) and Receiver Details (right), side by side ---
  const stampSize = 26;
  const stampTop = y;
  try {
    const stampDataUrl = await toDataUrl(qplusStamp);
    doc.addImage(stampDataUrl, "PNG", marginX + 10, stampTop, stampSize, stampSize, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the stamp rather than blocking the download.
  }

  const receiverX = pageWidth / 2 + 10;
  let ry = stampTop + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("RECEIVER DETAILS", receiverX, ry);
  ry += 10;

  const receiverRows: [string, string][] = [
    ["NAME:", input.receiverName || ""],
    ["DESIGNATION:", input.receiverDesignation || ""],
    ["SIGNATURE:", ""],
  ];
  doc.setFontSize(9.5);
  for (const [label, value] of receiverRows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, receiverX, ry);
    doc.setFont("helvetica", "normal");
    doc.text(value, receiverX + doc.getTextWidth(label) + 3, ry);
    ry += 10;
  }

  // --- Footer ---
  const footerY = 285;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.15);
  doc.line(marginX, footerY, contentRight, footerY);
  doc.setFontSize(7.6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text(`Contact ${COMPANY.mobile}`, marginX, footerY + 5);
  doc.text(`Email: ${COMPANY.email}`, pageWidth / 2, footerY + 5, { align: "center" });
  doc.text(COMPANY.website, contentRight, footerY + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);

  const fileSafe = (input.noteNo || "delivery-note").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `delivery-note-${fileSafe}.pdf`;
  if (opts?.preview) {
    const target = opts.previewWindow ?? window.open("", "_blank");
    if (target) target.location.href = doc.output("bloburl").toString();
  } else {
    doc.save(filename);
  }
}
