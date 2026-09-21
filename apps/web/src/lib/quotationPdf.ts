import { jsPDF } from "jspdf";
import { format } from "date-fns";
import qplusLogo from "../assets/QPlus.png";
import qplusStamp from "../assets/qplus-company-stamp.png";

// Fixed company letterhead details — never entered per-quotation, matches
// the company's standard "Proposal For Supply and Installation of ..." PDF.
// Font sizes AND page-1 line positions below were measured directly off
// that reference PDF (via pdfjs-dist text-run transforms / operator list),
// not eyeballed — page 1 is the cover (letterhead/recipient/title/ref),
// which the reference keeps alone on its own page; page 2+ is the
// quotation body, rendered almost entirely at 8.2pt.
const COMPANY = {
  addressLines: ["Office No. 203,", "Dar Al Wuheida Building,", "Hor Al Anz East, Dubai, UAE.", "P.O Box-16615"],
  mobile: "+971 4 393 1110",
  email: "info@qplus-ts.com",
  website: "www.qplus-ts.com",
};

// height / width, from the source PNG's actual pixel dimensions (3374x1697)
// — re-measure this if the logo file is ever swapped, or it'll silently
// stretch/squash the replacement. Never hardcode a size without this ratio.
const LOGO_ASPECT = 1697 / 3374;
// The reference PDF places its own (also wide, horizontal-lockup) logo at
// ~68.7mm wide — sized ours to the same on-page width rather than a guess.
const LOGO_WIDTH_MM = 68.7;

// Page-1 vertical rhythm, in mm from the top of the page — lifted directly
// off the reference PDF's text positions (converted from its bottom-up PDF
// points), not estimated. Title/PROJECT/Ref sit at fixed spots regardless of
// how many recipient lines are present, same as the reference.
const PAGE1_Y = {
  addressStart: 16.9,
  addressLineGap: 3.6,
  date: 48.65,
  to: 71.93,
  recipientGaps: [6.7, 7.06, 6.7], // To->Name, Name->Company, Company->Location
  title: 147.42,
  project: 180.23,
  ref: 214.45,
};

export const DEFAULT_PAYMENT_TERMS = "90% Advance Payment on Order Confirmation.\n10% Payment Upon Work Completion.";

export const DEFAULT_NOTES = [
  "Material Price May Varies According to the Current Market Condition.",
  "Work Permit and Gate Pass to be Provided.",
  "Any Civil, Electrical and Cable Pulling work is not included in the Quotation.",
].join("\n");

export const DEFAULT_GENERAL_TERMS = [
  "Any additional work apart from the above proposal will be extra cost.",
  "The work will be started only after a formal contract /LPO and advance payment.",
  "All items and quantities are subject to remeasurable as per the quoted price and rates.",
  "Completion Time : To be mutually agreed",
  "All kind of Authority Approvals are not in our scope .",
  "Delays in statutory / local authority / govt departments are not contractors responsibility",
  "All fees / deposits towards all authorities are to be paid in advance by Client.",
  "Safe storage for keeping our materials to be provided",
  "Electricity / Water / Hoisting facilities etc to be provided free of cost",
  "Any approval, drawings, documentation is not included in this scope.",
].join("\n");

export interface QuotationLineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface QuotationPdfInput {
  refId: string; // final display value, e.g. "QPTS/QN/2026-0006" — printed verbatim
  projectName: string; // task title, shown as "PROJECT : X"
  title: string; // "Proposal For Supply and Installation of Server"
  recipientName: string;
  recipientCompany: string;
  recipientLocation: string;
  currency: string;
  lineItems: QuotationLineItem[];
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  validityDays: number;
  paymentTerms: string;
  notes: string;
  generalTerms: string;
  preparerName: string;
  preparerDesignation: string;
  preparerMobile: string;
  /** When true, omits Unit Price / Amount columns and the Total/VAT/Gross
   *  Total block entirely — for sharing scope/quantities without revealing
   *  commercial figures. */
  hidePrices?: boolean;
}

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Renders the company's fixed proposal letterhead and downloads it as a PDF —
 * layout/sections/boilerplate/font sizes/line spacing/grid borders all match
 * the standard template; only the fields on QuotationPdfInput vary per
 * quotation. */
export async function generateQuotationPdf(input: QuotationPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginX = 15;
  const contentRight = pageWidth - marginX;
  let y = 15;

  function ensureSpace(needed: number) {
    if (y + needed > 280) {
      printFooter();
      doc.addPage();
      y = 15;
    }
  }

  function printFooter() {
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, 285, contentRight, 285);
    doc.setFontSize(7.6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Contact ${COMPANY.mobile}`, marginX, 290);
    doc.text(`Email: ${COMPANY.email}`, pageWidth / 2, 290, { align: "center" });
    doc.text(COMPANY.website, contentRight, 290, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // Short underline beneath a section heading, matching the reference PDF's
  // own underlined headings — width follows the heading text, not a fixed bar.
  function underlineHeading(text: string, x: number, baselineY: number) {
    const w = doc.getTextWidth(text);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.15);
    doc.line(x, baselineY + 0.8, x + w, baselineY + 0.8);
  }

  // ============================= PAGE 1 — cover =============================
  // --- Header: logo left, company address block right ---
  try {
    const logoDataUrl = await toDataUrl(qplusLogo);
    const logoW = LOGO_WIDTH_MM;
    const logoH = logoW * LOGO_ASPECT;
    doc.addImage(logoDataUrl, "PNG", marginX, y, logoW, logoH, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the logo rather than blocking the download.
  }

  doc.setFontSize(6.8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  let addrY = PAGE1_Y.addressStart;
  for (const line of COMPANY.addressLines) {
    doc.text(line, contentRight, addrY, { align: "right" });
    addrY += PAGE1_Y.addressLineGap;
  }
  doc.text(`Mob: ${COMPANY.mobile}`, contentRight, addrY, { align: "right" });
  addrY += PAGE1_Y.addressLineGap;
  doc.text(`Email: ${COMPANY.email}`, contentRight, addrY, { align: "right" });
  addrY += PAGE1_Y.addressLineGap;
  doc.text(COMPANY.website, contentRight, addrY, { align: "right" });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(9.5);
  doc.text(`Date: ${format(new Date(), "d MMMM yyyy")}`, contentRight, PAGE1_Y.date, { align: "right" });

  // --- Recipient ---
  doc.setFontSize(12.2);
  y = PAGE1_Y.to;
  doc.text("To,", marginX, y);
  const recipientLines = [input.recipientName, input.recipientCompany, input.recipientLocation].filter(Boolean);
  recipientLines.forEach((line, i) => {
    y += PAGE1_Y.recipientGaps[i] ?? PAGE1_Y.recipientGaps[PAGE1_Y.recipientGaps.length - 1];
    doc.text(line, marginX, y);
  });

  // --- Title / project / ref — fixed positions, same as the reference ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16.3);
  doc.text(input.title, pageWidth / 2, PAGE1_Y.title, { align: "center" });

  doc.setFontSize(13.6);
  doc.text(`PROJECT : ${input.projectName.toUpperCase()}`, pageWidth / 2, PAGE1_Y.project, { align: "center" });
  doc.text(`Ref. ${input.refId}`, pageWidth / 2, PAGE1_Y.ref, { align: "center" });
  doc.setFont("helvetica", "normal");

  printFooter();

  // Page 1 is the cover only — the quotation body always starts on page 2,
  // matching the reference document exactly.
  doc.addPage();
  y = 15;

  // ============================= PAGE 2+ — body =============================
  const BODY_SIZE = 8.2;
  doc.setFontSize(BODY_SIZE);

  doc.setFont("helvetica", "bold");
  doc.text(`Sub : ${input.title}`, marginX, y);
  doc.setFont("helvetica", "normal");
  y += 6.5;
  const intro = [
    "Thank you very much for your enquiry.",
    "Please find below our most competitive offer for your requirement.",
    "We hope our offer is in line with your requirements and looking forward to hear from you soon.",
  ];
  for (const line of intro) {
    doc.text(line, marginX, y);
    y += 4.8;
  }
  y += 3;

  // --- Item table (full grid — outer border, column dividers, row dividers,
  // matching the reference PDF's actual vector lines) ---
  const cols = input.hidePrices
    ? [
        { key: "sl", label: "SL.No", width: 10 },
        { key: "desc", label: "ITEM DESCRIPTION", width: 140 },
        { key: "qty", label: "QTY", width: 14 },
        { key: "unit", label: "UNIT", width: 16 },
      ]
    : [
        { key: "sl", label: "SL.No", width: 10 },
        { key: "desc", label: "ITEM DESCRIPTION", width: 90 },
        { key: "qty", label: "QTY", width: 14 },
        { key: "unit", label: "UNIT", width: 16 },
        { key: "unitPrice", label: `UNIT PRICE\n(in ${input.currency})`, width: 24 },
        { key: "amount", label: `AMOUNT\n(in ${input.currency})`, width: 26 },
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
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.line(marginX, rowTop, marginX + tableWidth, rowTop);
    doc.line(marginX, rowTop + rowHeight, marginX + tableWidth, rowTop + rowHeight);
    for (const edge of colEdges) {
      doc.line(edge, rowTop, edge, rowTop + rowHeight);
    }
  }

  function drawTableHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(BODY_SIZE);
    doc.setFillColor(241, 245, 249);
    doc.rect(marginX, y, tableWidth, 9, "F");
    cols.forEach((c, i) => {
      const lines = c.label.split("\n");
      lines.forEach((l, li) => doc.text(l, colX[i] + c.width / 2, y + 4 + li * 3.2, { align: "center" }));
    });
    drawRowGrid(y, 9);
    y += 9;
    doc.setFont("helvetica", "normal");
  }

  ensureSpace(20);
  drawTableHeader();

  input.lineItems.forEach((item) => {
    const descLines = doc.splitTextToSize(item.description, cols[1].width - 4);
    const rowHeight = Math.max(7, descLines.length * 3.8 + 3);
    ensureSpace(rowHeight + 2);
    const rowTop = y;
    doc.setFontSize(BODY_SIZE);
    doc.setFont("helvetica", "bold");
    doc.text(String(input.lineItems.indexOf(item) + 1), colX[0] + cols[0].width / 2, rowTop + 4.5, { align: "center" });
    doc.setFont("helvetica", "italic");
    doc.text(descLines[0] ?? "", colX[1] + 1.5, rowTop + 4.5);
    if (descLines.length > 1) {
      doc.setFont("helvetica", "normal");
      doc.text(descLines.slice(1), colX[1] + 1.5, rowTop + 4.5 + 3.8);
    }
    doc.setFont("helvetica", "normal");
    doc.text(String(item.qty), colX[2] + cols[2].width / 2, rowTop + 4.5, { align: "center" });
    doc.text(item.unit, colX[3] + cols[3].width / 2, rowTop + 4.5, { align: "center" });
    if (!input.hidePrices) {
      doc.text(money(item.unitPrice), colX[4] + cols[4].width - 2, rowTop + 4.5, { align: "right" });
      doc.text(money(item.qty * item.unitPrice), colX[5] + cols[5].width - 2, rowTop + 4.5, { align: "right" });
    }
    drawRowGrid(rowTop, rowHeight);
    y = rowTop + rowHeight;
  });

  // --- Totals (single divider between the label and value zone, matching
  // the reference's own two-rect-per-row layout) — omitted entirely when
  // prices are hidden, since every row is a price figure. ---
  if (!input.hidePrices) {
    ensureSpace(24);
    const totalsDividerX = colX[4];
    const totalsRows: [string, string][] = [
      ["Total in " + input.currency, money(input.subtotal)],
      [`VAT ${input.vatRate}%`, money(input.vatAmount)],
      ["Gross Total in " + input.currency, money(input.totalAmount)],
    ];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(BODY_SIZE);
    for (const [label, value] of totalsRows) {
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.15);
      doc.rect(marginX, y, tableWidth, 7);
      doc.line(totalsDividerX, y, totalsDividerX, y + 7);
      doc.text(label, totalsDividerX - 2, y + 4.8, { align: "right" });
      doc.text(value, colX[5] + cols[5].width - 2, y + 4.8, { align: "right" });
      y += 7;
    }
  }
  // Breathing room after the table (or after the totals block, when shown) —
  // always applied, otherwise the no-price PDF ran the next section straight
  // into the table's bottom border.
  y += 8;

  // --- Offer validity ---
  ensureSpace(8);
  doc.text(`Offer Validity: ${String(input.validityDays).padStart(2, "0")} days`, marginX, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  // --- Payment terms — heading is fixed/printed by code (underlined, like
  // Notes/General Terms below); the field itself only ever holds the body
  // lines, no heading or bullet characters baked into its stored text ---
  ensureSpace(10);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Terms & Conditions", marginX, y);
  underlineHeading("Payment Terms & Conditions", marginX, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  for (const line of input.paymentTerms.split("\n").filter((l) => l.trim())) {
    ensureSpace(5);
    doc.text(line.trim(), marginX, y);
    y += 4.8;
  }
  y += 3;

  // --- Notes ---
  ensureSpace(10);
  doc.setFont("helvetica", "bold");
  doc.text("Notes:", marginX, y);
  underlineHeading("Notes:", marginX, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  input.notes
    .split("\n")
    .filter((l) => l.trim())
    .forEach((n, i) => {
      ensureSpace(5);
      doc.text(`${i + 1}) ${n.trim()}`, marginX, y);
      y += 4.8;
    });
  y += 3;

  // --- General terms ---
  ensureSpace(10);
  doc.setFont("helvetica", "bold");
  doc.text("General Terms and Conditions", marginX, y);
  underlineHeading("General Terms and Conditions", marginX, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  input.generalTerms
    .split("\n")
    .filter((l) => l.trim())
    .forEach((t, i) => {
      const lines = doc.splitTextToSize(`${i + 1}) ${t.trim()}`, tableWidth);
      ensureSpace(lines.length * 4.8 + 1);
      doc.text(lines, marginX, y);
      y += lines.length * 4.8;
    });
  y += 10;

  // --- Signature ---
  ensureSpace(24);
  doc.text("Thanks & Regards,", contentRight, y, { align: "right" });
  y += 6;
  const nameY = y; // baseline of the preparer's name — the company stamp overlaps this line
  doc.text(input.preparerName, contentRight, y, { align: "right" });
  y += 4.8;
  if (input.preparerDesignation) {
    doc.text(input.preparerDesignation, contentRight, y, { align: "right" });
    y += 4.8;
  }
  if (input.preparerMobile) {
    doc.text(`Mob: ${input.preparerMobile}`, contentRight, y, { align: "right" });
    y += 4.8;
  }

  // Company stamp, placed over the preparer's printed name — same as a
  // physical seal stamped across a signature on a paper copy.
  try {
    const stampDataUrl = await toDataUrl(qplusStamp);
    const stampSize = 28; // mm — square, source asset is trimmed to a 1:1 aspect
    const stampCenterX = contentRight - 20;
    const stampCenterY = nameY - 1.5; // nudge up from the text baseline to its visual center
    doc.addImage(stampDataUrl, "PNG", stampCenterX - stampSize / 2, stampCenterY - stampSize / 2, stampSize, stampSize, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the stamp rather than blocking the download.
  }

  printFooter();

  const fileSafe = input.projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`quotation-${fileSafe}${input.hidePrices ? "-no-price" : ""}.pdf`);
}
