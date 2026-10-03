import { jsPDF } from "jspdf";
import qplusLogo from "../assets/QPlus.png";
import { COMPANY, LOGO_ASPECT, LOGO_WIDTH_MM, toDataUrl } from "./quotationPdf";
import { fmtMoney, monthLabel } from "./hrFormat";

/** CONTRACT (request 1008) — implemented by the payroll work, consumed by Payroll pages and the Employee page's Salary tab. */
export interface PayslipPdfInput {
  month: string; // YYYY-MM
  employeeName: string;
  employeeCode: string;
  jobTitle: string | null;
  department: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  bonus: number;
  grossEarnings: number;
  daysInMonth: number;
  unpaidLeaveDays: number;
  leaveDeduction: number;
  otherDeduction: number;
  deductionNote: string | null;
  netPay: number;
  /** Stamps a DRAFT watermark — the payroll run isn't final yet. */
  isDraft?: boolean;
}

export interface PayslipPdfOptions {
  preview?: boolean;
  previewWindow?: Window | null;
}

// ----------------------------------------------------------------------------
// Number to words ("Dirhams One Thousand Two Hundred and Fifty Only")
// ----------------------------------------------------------------------------
const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    const restWords = rest < 20 ? ONES[rest] : TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : "");
    parts.push(hundreds ? `and ${restWords}` : restWords);
  }
  return parts.join(" ");
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const scales: Array<[number, string]> = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];
  const parts: string[] = [];
  let rem = n;
  for (const [size, name] of scales) {
    if (rem >= size) {
      parts.push(`${belowThousand(Math.floor(rem / size))} ${name}`);
      rem %= size;
    }
  }
  if (rem) {
    // "One Thousand and Five" reads better than "One Thousand Five".
    const tail = belowThousand(rem);
    parts.push(parts.length > 0 && rem < 100 ? `and ${tail}` : tail);
  }
  return parts.join(" ");
}

export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(Number.isFinite(amount) ? amount : 0) * 100);
  const dirhams = Math.floor(cents / 100);
  const fils = cents % 100;
  let words = `Dirhams ${integerToWords(dirhams)}`;
  if (fils) words += ` and ${integerToWords(fils)} Fils`;
  return `${amount < 0 ? "Minus " : ""}${words} Only`;
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
const PAGE_W = 210;
const MARGIN_X = 15;
const RIGHT = PAGE_W - MARGIN_X;

function drawWatermark(doc: jsPDF) {
  const anyDoc = doc as any;
  try {
    doc.saveGraphicsState();
    doc.setGState(new anyDoc.GState({ opacity: 0.1 }));
    doc.setTextColor(220, 38, 38);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(96);
    doc.text("DRAFT", PAGE_W / 2, 160, { align: "center", angle: 35 });
    doc.restoreGraphicsState();
  } catch {
    // Watermark is decorative; never block the PDF on it.
  }
  doc.setTextColor(0, 0, 0);
}

function drawPayslipPage(doc: jsPDF, input: PayslipPdfInput, logoDataUrl: string | null) {
  if (input.isDraft) drawWatermark(doc);

  // --- Letterhead: logo left, address right, rule beneath ---
  let y = 15;
  if (logoDataUrl) {
    const logoW = LOGO_WIDTH_MM * 0.62;
    doc.addImage(logoDataUrl, "PNG", MARGIN_X, y, logoW, logoW * LOGO_ASPECT, undefined, "NONE");
  }
  doc.setFontSize(7.6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  let addrY = 17;
  for (const line of [...COMPANY.addressLines, `Mob: ${COMPANY.mobile}`, `Email: ${COMPANY.email}`, COMPANY.website]) {
    doc.text(line, RIGHT, addrY, { align: "right" });
    addrY += 4;
  }
  doc.setTextColor(0, 0, 0);
  y = Math.max(y + 22, addrY + 4);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y, RIGHT, y);
  y += 12;

  // --- Title ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("PAYSLIP", PAGE_W / 2, y, { align: "center" });
  y += 6.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`For the month of ${monthLabel(input.month)}`, PAGE_W / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  if (input.isDraft) {
    y += 5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28);
    doc.text("DRAFT - figures are not final", PAGE_W / 2, y, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
  y += 9;

  // --- Employee block (two label/value columns inside a box) ---
  const boxTop = y;
  const colGap = 6;
  const colW = (RIGHT - MARGIN_X - 8 - colGap) / 2;
  const leftX = MARGIN_X + 4;
  const rightX = leftX + colW + colGap;
  const labelW = 26;

  const drawColumn = (x: number, rows: Array<[string, string]>, startY: number) => {
    let cy = startY;
    for (const [label, value] of rows) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(label, x, cy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9); // size set BEFORE measuring so wrapping matches the render
      const lines = doc.splitTextToSize(value || "-", colW - labelW) as string[];
      doc.text(lines, x + labelW, cy);
      cy += Math.max(1, lines.length) * 4.2 + 2;
    }
    return cy;
  };

  const leftEnd = drawColumn(
    leftX,
    [
      ["Employee:", input.employeeName],
      ["Employee ID:", input.employeeCode],
      ["Designation:", input.jobTitle ?? ""],
    ],
    boxTop + 7
  );
  const rightEnd = drawColumn(
    rightX,
    [
      ["Department:", input.department ?? ""],
      ["Bank:", input.bankName ?? ""],
      ["Account no.:", input.bankAccountNumber ?? ""],
    ],
    boxTop + 7
  );
  const boxBottom = Math.max(leftEnd, rightEnd) - 2 + 3;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.rect(MARGIN_X, boxTop, RIGHT - MARGIN_X, boxBottom - boxTop, "S");
  y = boxBottom + 8;

  // --- Earnings | Deductions ---
  const gap = 6;
  const tblW = (RIGHT - MARGIN_X - gap) / 2;
  const leftTblX = MARGIN_X;
  const rightTblX = MARGIN_X + tblW + gap;
  const headH = 8;
  const rowH = 7.5;
  const earnRows: Array<[string, number]> = [
    ["Basic salary", input.basicSalary],
    ["Housing allowance", input.housingAllowance],
    ["Transport allowance", input.transportAllowance],
    ["Other allowance", input.otherAllowance],
    ["Bonus", input.bonus],
  ];
  const bodyH = earnRows.length * rowH;
  const totalH = 8.5;

  const drawHeader = (x: number, label: string) => {
    doc.setFillColor(217, 217, 217);
    doc.rect(x, y, tblW, headH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, x + 3, y + 5.4);
    doc.text("AMOUNT (AED)", x + tblW - 3, y + 5.4, { align: "right" });
  };
  drawHeader(leftTblX, "EARNINGS");
  drawHeader(rightTblX, "DEDUCTIONS");

  const bodyTop = y + headH;
  const drawAmountRow = (x: number, top: number, label: string, amount: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(label, x + 3, top + 5);
    doc.text(fmtMoney(amount), x + tblW - 3, top + 5, { align: "right" });
  };

  earnRows.forEach(([label, amount], i) => drawAmountRow(leftTblX, bodyTop + i * rowH, label, amount));

  // Deductions: unpaid leave, then other deduction with its note beneath.
  const leaveLabel = `Unpaid leave (${input.unpaidLeaveDays} ${input.unpaidLeaveDays === 1 ? "day" : "days"})`;
  drawAmountRow(rightTblX, bodyTop, leaveLabel, input.leaveDeduction);
  drawAmountRow(rightTblX, bodyTop + rowH, "Other deduction", input.otherDeduction);
  if (input.deductionNote && input.deductionNote.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    let noteLines = doc.splitTextToSize(`Note: ${input.deductionNote.trim()}`, tblW - 6) as string[];
    const maxLines = 3; // keeps the note inside the deductions body (3 rows left under "Other deduction")
    if (noteLines.length > maxLines) {
      noteLines = noteLines.slice(0, maxLines);
      noteLines[maxLines - 1] = noteLines[maxLines - 1].replace(/.{0,3}$/, "...");
    }
    doc.text(noteLines, rightTblX + 3, bodyTop + rowH * 2 + 1);
    doc.setTextColor(0, 0, 0);
  }

  // Body grid lines
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  for (const x of [leftTblX, rightTblX]) {
    for (let i = 1; i < earnRows.length; i++) doc.line(x, bodyTop + i * rowH, x + tblW, bodyTop + i * rowH);
  }

  // Totals row (aligned across both tables)
  const totalTop = bodyTop + bodyH;
  const totalDeductions = input.leaveDeduction + input.otherDeduction;
  doc.setFillColor(241, 245, 249);
  doc.rect(leftTblX, totalTop, tblW, totalH, "F");
  doc.rect(rightTblX, totalTop, tblW, totalH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Gross earnings", leftTblX + 3, totalTop + 5.8);
  doc.text(fmtMoney(input.grossEarnings), leftTblX + tblW - 3, totalTop + 5.8, { align: "right" });
  doc.text("Total deductions", rightTblX + 3, totalTop + 5.8);
  doc.text(fmtMoney(totalDeductions), rightTblX + tblW - 3, totalTop + 5.8, { align: "right" });

  // Outer frames
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.rect(leftTblX, y, tblW, headH + bodyH + totalH, "S");
  doc.rect(rightTblX, y, tblW, headH + bodyH + totalH, "S");
  y = totalTop + totalH + 9;

  // --- Net pay highlight ---
  const netH = 16;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(MARGIN_X, y, RIGHT - MARGIN_X, netH, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("NET PAY (AED)", MARGIN_X + 5, y + 10);
  doc.setFontSize(15);
  doc.text(fmtMoney(input.netPay), RIGHT - 5, y + 10.4, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += netH + 8;

  // --- Amount in words ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Amount in words:", MARGIN_X, y);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  const wordLines = doc.splitTextToSize(amountInWords(input.netPay), RIGHT - MARGIN_X - 32) as string[];
  doc.text(wordLines, MARGIN_X + 32, y);
  y += wordLines.length * 4.6 + 6;

  // --- Pay period footnote ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Days in month: ${input.daysInMonth}    Unpaid leave days: ${input.unpaidLeaveDays}`, MARGIN_X, y);
  doc.setTextColor(0, 0, 0);

  // --- Footer ---
  const footerY = 281;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, footerY, RIGHT, footerY);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("This is a computer-generated payslip and does not require a signature.", PAGE_W / 2, footerY + 5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.text(`Contact ${COMPANY.mobile}`, MARGIN_X, footerY + 10);
  doc.text(`Email: ${COMPANY.email}`, PAGE_W / 2, footerY + 10, { align: "center" });
  doc.text(COMPANY.website, RIGHT, footerY + 10, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

async function loadLogo(): Promise<string | null> {
  try {
    return await toDataUrl(qplusLogo);
  } catch {
    return null; // non-fatal — render without the logo
  }
}

function finish(doc: jsPDF, filename: string, opts?: PayslipPdfOptions) {
  if (opts?.preview) {
    const target = opts.previewWindow ?? window.open("", "_blank");
    if (target) target.location.href = doc.output("bloburl").toString();
  } else {
    doc.save(filename);
  }
}

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");

/** Renders one employee's payslip for a month. */
export async function generatePayslipPdf(input: PayslipPdfInput, opts?: PayslipPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  drawPayslipPage(doc, input, logo);
  finish(doc, `payslip-${safe(input.employeeCode || "employee")}-${input.month}.pdf`, opts);
}

/** Renders several payslips (one page each) into a single PDF. */
export async function generatePayslipsPdf(inputs: PayslipPdfInput[], opts?: PayslipPdfOptions): Promise<void> {
  if (inputs.length === 0) throw new Error("There are no payslips to export.");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo();
  inputs.forEach((input, i) => {
    if (i > 0) doc.addPage();
    drawPayslipPage(doc, input, logo);
  });
  finish(doc, `payslips-${inputs[0].month}.pdf`, opts);
}
