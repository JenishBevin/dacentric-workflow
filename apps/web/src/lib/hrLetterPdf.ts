import { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { LetterType } from "../api/hr";
import qplusLogo from "../assets/QPlus.png";
import qplusStamp from "../assets/qplus-company-stamp.png";
import { COMPANY, LOGO_ASPECT, LOGO_WIDTH_MM, toDataUrl } from "./quotationPdf";
import { fmtMoney } from "./hrFormat";

/**
 * CONTRACT (request 1008) — implemented by the letters work, consumed by the
 * Employee page and Recruitment > Offer Letter Generation.
 *
 * Per-type `data` keys:
 *  OFFER:              designation, department?, joiningDate, basicSalary, housingAllowance, transportAllowance, otherAllowance, probationMonths?, noticePeriod?, validUntil?, terms?
 *  APPOINTMENT:        designation, department?, joiningDate, basicSalary, housingAllowance, transportAllowance, otherAllowance, probationMonths?, noticePeriod?, workingHours?, terms?
 *  EXPERIENCE:         designation, department?, joiningDate, lastWorkingDate, conduct?
 *  RELIEVING:          designation, joiningDate, lastWorkingDate, resignationDate?, remarks?
 *  SALARY_CERTIFICATE: designation, joiningDate, basicSalary, housingAllowance, transportAllowance, otherAllowance, addressedTo?, purpose?
 *  OTHER:              title, body (multi-line text), addressedTo?
 * Dates in `data` are yyyy-MM-dd strings; money values are numbers (AED / month).
 */
export interface HrLetterPdfInput {
  letterType: LetterType;
  refNo: string;
  issueDate: string; // ISO
  recipientName: string;
  recipientAddress?: string | null;
  data: Record<string, any>;
}

const COMPANY_NAME = "Q Plus Technical Service LLC";

// ---------------------------------------------------------------------------
// Small value helpers (the `data` blob is loosely typed and may be partial)
// ---------------------------------------------------------------------------
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** yyyy-MM-dd (or full ISO) -> local Date, built from the date part so a UTC-midnight ISO never shifts a day. */
function parseDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "03 October 2026", or `fallback` when the value is missing/invalid. */
function longDate(v: unknown, fallback = ""): string {
  const d = parseDate(v);
  return d ? format(d, "dd MMMM yyyy") : fallback;
}

/** "3" -> "3 months"; free text ("90 days") is used as-is. */
function periodText(v: unknown, unit: "month" | "day"): string {
  const s = str(v);
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return `${s} ${unit}${n === 1 ? "" : "s"}`;
  }
  return s;
}

const FILE_PREFIX: Record<LetterType, string> = {
  OFFER: "offer-letter",
  APPOINTMENT: "appointment-letter",
  EXPERIENCE: "experience-letter",
  RELIEVING: "relieving-letter",
  SALARY_CERTIFICATE: "salary-certificate",
  OTHER: "hr-letter",
};

/**
 * Renders a UAE-style company letter on the Q Plus letterhead. Handles
 * multi-page flow (paragraphs wrap and break across pages line by line,
 * tables and signature blocks are kept together).
 */
export async function generateHrLetterPdf(
  input: HrLetterPdfInput,
  opts?: { preview?: boolean; previewWindow?: Window | null }
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const MX = 20;
  const CR = pageWidth - MX; // content right edge
  const CW = CR - MX; // content width
  const BOTTOM = 272; // lowest y body content may reach (footer starts at 285)
  const PT = 0.3528; // mm per point
  const data = input.data ?? {};
  const name = str(input.recipientName);
  const isPreview = input.refNo === "PREVIEW";
  const refLabel = isPreview ? "PREVIEW (not issued)" : input.refNo;
  let y = 15;

  // ----------------------------- layout primitives -----------------------------
  const lineHeight = (size: number) => size * PT * 1.5;

  function newPage() {
    doc.addPage();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(COMPANY_NAME, MX, 12);
    doc.text(`Ref: ${refLabel}`, CR, 12, { align: "right" });
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(MX, 14, CR, 14);
    doc.setTextColor(0, 0, 0);
    y = 22;
  }

  /** Starts a new page when `h` mm would not fit above the footer. */
  function ensureSpace(h: number): boolean {
    if (y + h > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  }

  interface ParaOpts {
    size?: number;
    bold?: boolean;
    italic?: boolean;
    gap?: number; // extra space after the paragraph
    indent?: number;
    align?: "left" | "center" | "right";
    color?: [number, number, number];
  }

  /** Wrapped paragraph that flows across pages line by line. */
  function para(text: string, o: ParaOpts = {}) {
    const size = o.size ?? 10;
    const indent = o.indent ?? 0;
    const apply = () => {
      doc.setFont("helvetica", o.bold && o.italic ? "bolditalic" : o.bold ? "bold" : o.italic ? "italic" : "normal");
      doc.setFontSize(size);
      const c = o.color ?? [0, 0, 0];
      doc.setTextColor(c[0], c[1], c[2]);
    };
    apply();
    // Measure at the exact font/size it will render at.
    const lines = doc.splitTextToSize(text, CW - indent) as string[];
    const lh = lineHeight(size);
    for (const line of lines) {
      if (ensureSpace(lh)) apply();
      const baseline = y + size * PT * 0.85;
      if (o.align === "center") doc.text(line, MX + CW / 2, baseline, { align: "center" });
      else if (o.align === "right") doc.text(line, CR, baseline, { align: "right" });
      else doc.text(line, MX + indent, baseline);
      y += lh;
    }
    y += o.gap ?? 3;
    doc.setTextColor(0, 0, 0);
  }

  /** Each non-empty line is its own paragraph; blank lines add extra spacing. */
  function textBlock(text: string, o: ParaOpts = {}) {
    const lines = str(text).split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        y += 2.5;
        continue;
      }
      para(line, { gap: 2.5, ...o });
    }
  }

  function heading(text: string) {
    ensureSpace(18); // heading + at least a couple of lines
    para(text, { bold: true, size: 10.5, gap: 2 });
  }

  /** Numbered clause with a hanging indent. */
  function clause(n: number, text: string) {
    ensureSpace(lineHeight(10) * 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`${n}.`, MX, y + 10 * PT * 0.85);
    para(text, { indent: 7, gap: 2.5 });
  }

  function recipientBlock() {
    para("To,", { gap: 0.5 });
    para(name || "-", { bold: true, gap: 0.5 });
    const addr = str(input.recipientAddress)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of addr) para(line, { gap: 0 });
    y += 4;
  }

  function subject(text: string) {
    ensureSpace(20);
    para(`Subject: ${text}`, { bold: true, size: 10.5, gap: 4 });
  }

  /** Salary breakdown table (all amounts AED / month), kept together on one page. */
  function compensationTable() {
    const rows: Array<[string, number]> = [
      ["Basic salary", num(data.basicSalary)],
      ["Housing allowance", num(data.housingAllowance)],
      ["Transport allowance", num(data.transportAllowance)],
      ["Other allowance", num(data.otherAllowance)],
    ];
    const total = rows.reduce((s, r) => s + r[1], 0);
    const rowH = 7;
    const totalRows = rows.length + 2; // header + rows + total
    ensureSpace(rowH * (totalRows + 1) + 4);
    const top = y;
    const col1 = 115;

    doc.setFillColor(226, 232, 240);
    doc.rect(MX, top, CW, rowH, "F");
    doc.setFillColor(241, 245, 249);
    doc.rect(MX, top + rowH * (rows.length + 1), CW, rowH, "F");

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9.5);
    const textY = (i: number) => top + rowH * i + 4.8;
    doc.setFont("helvetica", "bold");
    doc.text("Component", MX + 3, textY(0));
    doc.text("Monthly amount (AED)", CR - 3, textY(0), { align: "right" });
    doc.setFont("helvetica", "normal");
    rows.forEach(([label, amount], i) => {
      doc.text(label, MX + 3, textY(i + 1));
      doc.text(fmtMoney(amount), CR - 3, textY(i + 1), { align: "right" });
    });
    doc.setFont("helvetica", "bold");
    doc.text("Total monthly salary", MX + 3, textY(rows.length + 1));
    doc.text(fmtMoney(total), CR - 3, textY(rows.length + 1), { align: "right" });

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.2);
    for (let i = 0; i <= totalRows; i++) doc.line(MX, top + rowH * i, CR, top + rowH * i);
    doc.line(MX, top, MX, top + rowH * totalRows);
    doc.line(CR, top, CR, top + rowH * totalRows);
    doc.line(MX + col1, top, MX + col1, top + rowH * totalRows);

    y = top + rowH * totalRows + 5;
    doc.setFont("helvetica", "normal");
  }

  /** Closing + company signature block with stamp (best-effort). */
  async function signatureBlock(closing: string) {
    ensureSpace(52);
    para(closing, { gap: 2 });
    y += 1;
    para(`For ${COMPANY_NAME}`, { bold: true, gap: 0 });
    const stampTop = y;
    try {
      const stampDataUrl = await toDataUrl(qplusStamp);
      doc.addImage(stampDataUrl, "PNG", MX + 78, stampTop - 3, 28, 28, undefined, "NONE");
    } catch {
      // Non-fatal — proceed without the stamp rather than blocking the download.
    }
    y = stampTop + 20;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(MX, y, MX + 62, y);
    y += 1.5;
    para("Authorized Signatory / HR Manager", { size: 9, gap: 4 });
  }

  /** Name / Signature / Date block for the recipient to complete. */
  function acknowledgementBlock(title: string, statement: string) {
    ensureSpace(60);
    y += 2;
    heading(title);
    para(statement, { gap: 5 });
    const fields: Array<[string, string]> = [
      ["Name:", name],
      ["Signature:", ""],
      ["Date:", ""],
    ];
    for (const [label, value] of fields) {
      ensureSpace(11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const baseline = y + 7;
      doc.text(label, MX, baseline);
      if (value) doc.text(value, MX + 26, baseline - 1);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.2);
      doc.line(MX + 25, baseline, MX + 105, baseline);
      y += 10;
    }
  }

  // ----------------------------- page-1 letterhead -----------------------------
  try {
    const logoDataUrl = await toDataUrl(qplusLogo);
    const logoW = LOGO_WIDTH_MM * 0.62;
    const logoH = logoW * LOGO_ASPECT;
    doc.addImage(logoDataUrl, "PNG", MX, 15, logoW, logoH, undefined, "NONE");
  } catch {
    // Non-fatal — proceed without the logo rather than blocking the download.
  }
  doc.setFontSize(7.6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  const headerLines = [
    COMPANY.addressLines.slice(0, 2).join(" "),
    COMPANY.addressLines.slice(2).join(" "),
    `Mob: ${COMPANY.mobile}`,
    `Email: ${COMPANY.email}`,
    COMPANY.website,
  ];
  let addrY = 17;
  for (const line of headerLines) {
    doc.text(line, CR, addrY, { align: "right" });
    addrY += 3.9;
  }
  doc.setTextColor(0, 0, 0);
  y = Math.max(15 + LOGO_WIDTH_MM * 0.62 * LOGO_ASPECT, addrY) + 3;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(MX, y, CR, y);
  y += 7;

  // Reference + issue date
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Ref: ${refLabel}`, MX, y + 3);
  doc.text(`Date: ${longDate(input.issueDate, str(input.issueDate))}`, CR, y + 3, { align: "right" });
  y += 11;

  // ----------------------------- letter body -----------------------------
  const designation = str(data.designation) || "the position";
  const dept = str(data.department);
  const joining = longDate(data.joiningDate, "the date of joining");
  const posWithDept = dept ? `${designation} in the ${dept} department` : designation;

  switch (input.letterType) {
    case "OFFER": {
      recipientBlock();
      subject("Offer of Employment");
      para(`Dear ${name || "Candidate"},`);
      para(
        `We are pleased to offer you the position of ${posWithDept} at ${COMPANY_NAME} (the "Company"), subject to the terms and conditions set out in this letter.`
      );
      const details: string[] = [];
      if (str(data.joiningDate)) details.push(`Your proposed date of joining is ${longDate(data.joiningDate)}.`);
      const probation = periodText(data.probationMonths, "month");
      if (probation) details.push(`You will be on probation for ${probation} from the date of joining.`);
      const notice = periodText(data.noticePeriod, "day");
      if (notice) details.push(`The notice period applicable to your employment is ${notice}.`);
      if (details.length) para(details.join(" "));
      heading("Monthly compensation");
      para("Your monthly remuneration will comprise the following (all amounts in AED):", { gap: 2.5 });
      compensationTable();
      if (str(data.validUntil)) {
        para(
          `This offer is valid until ${longDate(data.validUntil)}. If we do not receive your signed acceptance by that date, the offer may be withdrawn.`
        );
      }
      if (str(data.terms)) {
        heading("Additional terms");
        textBlock(data.terms);
        y += 1;
      }
      para(
        "This offer is subject to satisfactory verification of your documents and credentials, medical fitness, and completion of the UAE employment visa and residency formalities, where applicable. Your employment will be governed by the laws of the United Arab Emirates and the policies of the Company."
      );
      para("Kindly confirm your acceptance of this offer by signing and returning a copy of this letter. We look forward to welcoming you to the Company.", { gap: 5 });
      await signatureBlock("Yours sincerely,");
      acknowledgementBlock(
        "Candidate acceptance",
        `I, ${name || "the undersigned"}, accept the above offer of employment on the terms and conditions stated in this letter.`
      );
      break;
    }

    case "APPOINTMENT": {
      recipientBlock();
      subject("Letter of Appointment");
      para(`Dear ${name || "Employee"},`);
      para(
        `We are pleased to confirm your appointment as ${posWithDept} at ${COMPANY_NAME} (the "Company") with effect from ${joining}, on the following terms and conditions:`,
        { gap: 4 }
      );
      let n = 0;
      clause(++n, `Position: You are appointed as ${posWithDept}. You will perform the duties assigned to you by the Company from time to time.`);
      clause(++n, `Commencement: Your employment commences on ${joining}.`);
      const probation = periodText(data.probationMonths, "month");
      if (probation) {
        clause(
          ++n,
          `Probation: You will be on probation for ${probation} from the date of joining. The Company may confirm, extend or terminate your employment during or at the end of the probation period in accordance with UAE labour law.`
        );
      }
      if (str(data.workingHours)) clause(++n, `Working hours: ${str(data.workingHours)}.`.replace(/\.\.$/, "."));
      clause(++n, "Remuneration: Your monthly remuneration (all amounts in AED) will be as follows:");
      compensationTable();
      const notice = periodText(data.noticePeriod, "day");
      if (notice) {
        clause(++n, `Notice period: Either party may terminate this employment by giving ${notice} written notice, or payment in lieu thereof, in accordance with UAE labour law.`);
      }
      if (str(data.terms)) {
        clause(++n, "Additional terms:");
        textBlock(data.terms, { indent: 7 });
      }
      clause(
        ++n,
        "Confidentiality: You shall keep confidential all information relating to the Company, its clients and its business affairs, both during and after your employment, and shall not use it for any purpose other than the Company's business."
      );
      clause(++n, "Company policies: You are required to comply with all policies, rules and procedures of the Company as issued or amended from time to time.");
      clause(++n, "Governing law: This appointment is governed by the labour laws of the United Arab Emirates.");
      y += 2;
      para("Please sign and return the duplicate copy of this letter as a token of your acceptance of these terms. We wish you a successful career with the Company.", { gap: 5 });
      await signatureBlock("Yours sincerely,");
      acknowledgementBlock(
        "Employee acknowledgement",
        `I, ${name || "the undersigned"}, have read and understood the terms of this letter and accept them.`
      );
      break;
    }

    case "EXPERIENCE": {
      para("To Whom It May Concern", { bold: true, gap: 5 });
      subject("Experience Certificate");
      const to = longDate(data.lastWorkingDate, "the date of leaving");
      para(
        `This is to certify that ${name || "the employee"} worked with ${COMPANY_NAME} as ${posWithDept} from ${joining} to ${to}.`
      );
      para(str(data.conduct) || `During the period of employment, the conduct and performance of ${name || "the employee"} were satisfactory.`);
      para(`We wish ${name || "the employee"} every success in all future endeavours.`);
      para("This certificate is issued at the request of the employee.", { gap: 6 });
      await signatureBlock("Yours faithfully,");
      break;
    }

    case "RELIEVING": {
      recipientBlock();
      subject("Relieving Letter");
      para(`Dear ${name || "Employee"},`);
      const resignation = longDate(data.resignationDate);
      para(
        `This is with reference to your resignation${resignation ? ` dated ${resignation}` : ""} from the position of ${designation} at ${COMPANY_NAME}, which has been accepted by the Company.`
      );
      para(
        `You are hereby relieved from your duties with effect from the close of business on ${longDate(data.lastWorkingDate, "your last working day")}. You were employed with the Company from ${joining}.`
      );
      para(
        str(data.remarks) ||
          "We confirm that you have handed over all Company property and responsibilities, and that there are no dues pending from your side towards the Company. Your final settlement will be processed in accordance with your employment contract and UAE labour law."
      );
      para("We thank you for your contribution to the Company and wish you the very best in your future career.", { gap: 6 });
      await signatureBlock("Yours sincerely,");
      break;
    }

    case "SALARY_CERTIFICATE": {
      para(str(data.addressedTo) || "To Whom It May Concern", { bold: true, gap: 5 });
      subject("Salary Certificate");
      para(
        `This is to certify that ${name || "the employee"} is employed with ${COMPANY_NAME} as ${designation} since ${joining}, and is currently drawing the following monthly salary (all amounts in AED):`
      );
      compensationTable();
      const purpose = str(data.purpose);
      para(
        `This certificate is issued at the request of the employee${purpose ? ` for the purpose of ${purpose}` : ""}, without any liability or responsibility on the part of the Company or its officers.`,
        { gap: 6 }
      );
      await signatureBlock("Yours faithfully,");
      break;
    }

    case "OTHER":
    default: {
      if (str(data.addressedTo)) para(str(data.addressedTo), { bold: true, gap: 5 });
      ensureSpace(20);
      para(str(data.title) || "Letter", { bold: true, size: 12, align: "center", gap: 5 });
      textBlock(data.body, {});
      y += 4;
      await signatureBlock("Yours sincerely,");
      break;
    }
  }

  // ----------------------------- footer on every page -----------------------------
  const pageCount = doc.getNumberOfPages();
  const footerY = 285;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.line(MX, footerY, CR, footerY);
    doc.setFontSize(7.6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Contact ${COMPANY.mobile}`, MX, footerY + 5);
    doc.text(`Email: ${COMPANY.email}`, pageWidth / 2, footerY + 5, { align: "center" });
    doc.text(COMPANY.website, CR, footerY + 5, { align: "right" });
    if (pageCount > 1) doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, footerY + 9, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const fileSafe = (input.refNo || "letter").replace(/[^a-z0-9]+/gi, "-");
  const filename = `${FILE_PREFIX[input.letterType] ?? "hr-letter"}-${fileSafe}.pdf`;
  if (opts?.preview) {
    const target = opts.previewWindow ?? window.open("", "_blank");
    if (target) target.location.href = doc.output("bloburl").toString();
  } else {
    doc.save(filename);
  }
}
