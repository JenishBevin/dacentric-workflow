import { generateHrLetterPdf, type HrLetterPdfInput } from "../../../lib/hrLetterPdf";
import { toDateInput } from "../../../lib/hrFormat";
import type { Candidate } from "../../../api/hr";

export function offerLetterInput(c: Candidate): HrLetterPdfInput {
  return {
    letterType: "OFFER",
    refNo: c.offerRefNo ?? "",
    issueDate: c.offerDate ?? new Date().toISOString(),
    recipientName: c.fullName,
    data: {
      designation: c.offeredDesignation ?? c.designation,
      joiningDate: toDateInput(c.joiningDate),
      basicSalary: Number(c.offerBasic ?? 0),
      housingAllowance: Number(c.offerHousing ?? 0),
      transportAllowance: Number(c.offerTransport ?? 0),
      otherAllowance: Number(c.offerOther ?? 0),
      terms: c.offerTerms ?? undefined,
    },
  };
}

/** Preview opens a tab synchronously, so call this directly from the click handler. */
export async function openOfferLetter(c: Candidate, mode: "preview" | "download") {
  const previewWindow = mode === "preview" ? window.open("", "_blank") : null;
  try {
    await generateHrLetterPdf(offerLetterInput(c), mode === "preview" ? { preview: true, previewWindow } : undefined);
  } catch (err) {
    previewWindow?.close();
    throw err;
  }
}
