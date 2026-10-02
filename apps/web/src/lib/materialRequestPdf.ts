import { jsPDF } from "jspdf";
import { format } from "date-fns";
import qplusLogo from "../assets/QPlus.png";
import { LOGO_ASPECT, LOGO_WIDTH_MM, toDataUrl } from "./quotationPdf";

// Same banner blue/gray as the Purchase Order PDF — sampled from the
// company's own reference templates, not eyeballed.
const BLUE: [number, number, number] = [57, 105, 173];
const LIGHT_GRAY: [number, number, number] = [217, 217, 217];

export interface MaterialRequestLineItem {
  description: string;
  unit: string;
  qty: number;
  remarks?: string;
}

export interface MaterialRequestPdfInput {
  requestNo: string;
  projectName: string;
  requestedByName: string;
  department: string;
  empId: string;
  urgency: "NORMAL" | "URGENT";
  requestDate: string | null;
  requiredDate: string | null;
  items: MaterialRequestLineItem[];
  comments: string;
  reviewedByName: string;
  approvedByName: string;
}

/** Renders the company's Material Request Form (MRF) — matching the
 * company's own reference template (banner blue, item table, Requested/
 * Reviewed/Approved By sign-off blocks). Signatures are left blank for
 * physical sign-off, same convention as the Delivery Note PDF. */
export async function generateMaterialRequestPdf(input: MaterialRequestPdfInput, opts?: { preview?: boolean; previewWindow?: Window | null }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginX = 15;
  const contentRight = pageWidth - marginX;
  const contentWidth = contentRight - marginX;

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
  doc.setFontSize(20);
  doc.setTextColor(140, 140, 140);
  doc.text("MATERIAL REQUEST FORM", contentRight, y + 10, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 26;

  function bannerRow(cols: { label: string; width: number }[], rowY: number, height = 6) {
    let x = marginX;
    doc.setFillColor(...BLUE);
    doc.rect(marginX, rowY, contentWidth, height, "F");
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.rect(marginX, rowY, contentWidth, height, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    for (const c of cols) {
      doc.text(c.label, x + c.width / 2, rowY + height / 2 + 1.3, { align: "center" });
      x += c.width;
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
  }

  // --- Project Name / Request No ---
  const pCol1 = contentWidth * 0.6;
  const pCol2 = contentWidth - pCol1;
  bannerRow([{ label: "PROJECT NAME", width: pCol1 }, { label: "REQUEST NO", width: pCol2 }], y);
  y += 6;
  doc.setDrawColor(0, 0, 0);
  doc.rect(marginX, y, pCol1, 8, "S");
  doc.rect(marginX + pCol1, y, pCol2, 8, "S");
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text(input.projectName, marginX + 2, y + 5.3);
  doc.text(input.requestNo, marginX + pCol1 + pCol2 / 2, y + 5.3, { align: "center" });
  doc.setFont("helvetica", "normal");
  y += 8;

  // --- Requested By / Department / Date ---
  const leftW = 130;
  const dateW = contentWidth - leftW;
  const nameW = leftW * (70 / 130);
  const deptW = leftW - nameW;
  bannerRow([{ label: "REQUESTED BY", width: nameW }, { label: "DEPARTMENT", width: deptW }, { label: "DATE", width: dateW }], y);
  y += 6;

  const rowAH = 11;
  const rowBH = 11;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  // Row A: name | department | Requested Date
  doc.rect(marginX, y, nameW, rowAH, "S");
  doc.rect(marginX + nameW, y, deptW, rowAH, "S");
  doc.rect(marginX + leftW, y, dateW, rowAH, "S");
  doc.setFontSize(9);
  doc.text(input.requestedByName, marginX + 2, y + rowAH / 2 + 1.3);
  doc.text(input.department, marginX + nameW + 2, y + rowAH / 2 + 1.3);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Requested Date :", marginX + leftW + 2, y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(input.requestDate ? format(new Date(input.requestDate), "dd/MM/yyyy") : "", marginX + leftW + 2, y + 9.5);
  y += rowAH;

  // Row B: EMP ID | NORMAL/URGENT checkboxes | Required Date
  doc.rect(marginX, y, nameW, rowBH, "S");
  doc.rect(marginX + nameW, y, deptW, rowBH, "S");
  doc.rect(marginX + leftW, y, dateW, rowBH, "S");
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("EMP ID :", marginX + 2, y + rowBH / 2 + 1.3);
  doc.setFont("helvetica", "normal");
  doc.text(input.empId, marginX + 16, y + rowBH / 2 + 1.3);

  function checkbox(cx: number, cy: number, checked: boolean) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(cx, cy - 3, 3.2, 3.2, "S");
    if (checked) {
      doc.setLineWidth(0.4);
      doc.line(cx, cy - 3, cx + 3.2, cy);
      doc.line(cx, cy, cx + 3.2, cy - 3.2);
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("NORMAL", marginX + nameW + 2, y + rowBH / 2 + 1.3);
  checkbox(marginX + nameW + 20, y + rowBH / 2 + 1.8, input.urgency === "NORMAL");
  doc.text("URGENT", marginX + nameW + 27, y + rowBH / 2 + 1.3);
  checkbox(marginX + nameW + 44, y + rowBH / 2 + 1.8, input.urgency === "URGENT");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Required Date :", marginX + leftW + 2, y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(input.requiredDate ? format(new Date(input.requiredDate), "dd/MM/yyyy") : "", marginX + leftW + 2, y + 9.5);
  y += rowBH + 6;

  // --- Item table ---
  const cols = [
    { label: "SL.NO.", width: 14 },
    { label: "MATERIAL DESCRIPTION", width: 80 },
    { label: "UNIT", width: 20 },
    { label: "QTY", width: 20 },
    { label: "REMARKS", width: 46 },
  ];
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  const colX: number[] = [];
  let cx2 = marginX;
  for (const c of cols) {
    colX.push(cx2);
    cx2 += c.width;
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

  const items = input.items.length > 0 ? input.items : [{ description: "", unit: "", qty: "" as any, remarks: "" }];
  items.forEach((item, idx) => {
    // Measure at the same size the text actually renders at below — splitting
    // at a smaller size than the render font understates the width, letting
    // a borderline-length description slip through as "one line" when it
    // actually overflows the column at its real, larger render size.
    doc.setFontSize(8.5);
    const descLines = doc.splitTextToSize(item.description || "", cols[1].width - 4) as string[];
    const rowHeight = Math.max(7.5, descLines.length * 3.8 + 3);
    if (y + rowHeight > 265) {
      doc.addPage();
      y = 20;
    }
    const rowTop = y;
    doc.text(input.items.length > 0 ? String(idx + 1) : "", colX[0] + cols[0].width / 2, rowTop + 5, { align: "center" });
    doc.text(descLines, colX[1] + 2, rowTop + 5);
    doc.text(item.unit || "", colX[2] + cols[2].width / 2, rowTop + 5, { align: "center" });
    doc.text(item.qty === "" ? "" : String(item.qty), colX[3] + cols[3].width / 2, rowTop + 5, { align: "center" });
    doc.text(item.remarks || "", colX[4] + 2, rowTop + 5);
    drawRowGrid(rowTop, rowHeight);
    y = rowTop + rowHeight;
  });
  y += 8;

  // --- Comments ---
  if (y > 255) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(marginX, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("COMMENTS", marginX + 2, y + 4.2);
  y += 6;
  const commentsBoxH = 16;
  doc.setDrawColor(0, 0, 0);
  doc.rect(marginX, y, contentWidth, commentsBoxH, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const commentLines = doc.splitTextToSize(input.comments || "", contentWidth - 4) as string[];
  doc.text(commentLines.slice(0, 3), marginX + 2, y + 5);
  y += commentsBoxH + 8;

  // --- Requested By / Reviewed By / Approved By sign-off ---
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  const signColW = contentWidth / 3;
  const signLabels = ["Requested By", "Reviewed By", "Approved By"];
  const signNames = [input.requestedByName, input.reviewedByName, input.approvedByName];
  bannerRow(signLabels.map((label) => ({ label, width: signColW })), y);
  y += 6;
  const signBoxH = 24;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  for (let i = 0; i < 3; i++) doc.rect(marginX + i * signColW, y, signColW, signBoxH, "S");
  doc.setFontSize(8.5);
  const fieldLabels = ["Name :", "Desg  :", "Sign  :", "Date  :"];
  for (let i = 0; i < 3; i++) {
    let fy = y + 5;
    const colBaseX = marginX + i * signColW + 2;
    fieldLabels.forEach((label, li) => {
      doc.setFont("helvetica", "normal");
      doc.text(label, colBaseX, fy);
      if (li === 0 && signNames[i]) doc.text(signNames[i], colBaseX + 14, fy);
      fy += 5.5;
    });
  }
  y += signBoxH;

  const fileSafe = (input.requestNo || "material-request").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `material-request-${fileSafe}.pdf`;
  if (opts?.preview) {
    const target = opts.previewWindow ?? window.open("", "_blank");
    if (target) target.location.href = doc.output("bloburl").toString();
  } else {
    doc.save(filename);
  }
}
