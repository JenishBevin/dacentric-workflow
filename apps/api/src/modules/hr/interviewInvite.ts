import type { EmailAttachment } from "../../lib/email";

const COMPANY_NAME = "Q Plus Technical Service LLC";
const TIME_ZONE = "Asia/Dubai";
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const MODE_LABEL: Record<string, string> = { ONSITE: "On-site", VIDEO: "Video call", PHONE: "Phone call" };

export interface InviteDetails {
  interviewId: string;
  candidateName: string;
  designation: string;
  round: string;
  scheduledAt: Date;
  mode: string;
  interviewerName: string;
  locationOrLink: string | null;
  message: string | null;
  senderName: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formatWhen(date: Date): string {
  const day = date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TIME_ZONE });
  return `${day}, ${time} (UAE time)`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function buildIcs(d: InviteDetails): EmailAttachment {
  const end = new Date(d.scheduledAt.getTime() + DEFAULT_DURATION_MS);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${COMPANY_NAME}//Interview Invitation//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${d.interviewId}@interviews.qplus`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(d.scheduledAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`Interview - ${d.designation} (${d.round})`)}`,
    ...(d.locationOrLink ? [`LOCATION:${icsEscape(d.locationOrLink)}`] : []),
    `DESCRIPTION:${icsEscape(`${d.round} interview for ${d.designation} with ${d.interviewerName} at ${COMPANY_NAME}.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return { filename: "interview.ics", content: lines.join("\r\n"), contentType: "text/calendar; charset=utf-8; method=PUBLISH" };
}

export function buildInterviewInviteEmail(d: InviteDetails) {
  const subject = `Interview invitation - ${d.designation} (${d.round}) | ${COMPANY_NAME}`;
  const when = formatWhen(d.scheduledAt);
  const mode = MODE_LABEL[d.mode] ?? d.mode;
  const isLink = !!d.locationOrLink && /^https?:\/\//i.test(d.locationOrLink);
  const whereLabel = d.mode === "VIDEO" ? "Meeting link" : d.mode === "PHONE" ? "Contact" : "Location";

  const rows: Array<[string, string, string]> = [
    ["Position", d.designation, esc(d.designation)],
    ["Round", d.round, esc(d.round)],
    ["Date & time", when, esc(when)],
    ["Mode", mode, esc(mode)],
    ...(d.locationOrLink
      ? [[whereLabel, d.locationOrLink, isLink ? `<a href="${esc(d.locationOrLink)}" style="color:#4f46e5">${esc(d.locationOrLink)}</a>` : esc(d.locationOrLink)] as [string, string, string]]
      : []),
    ["Interviewer", d.interviewerName, esc(d.interviewerName)],
  ];

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.55;max-width:560px">
<p>Dear ${esc(d.candidateName)},</p>
<p>Thank you for your interest in joining <strong>${COMPANY_NAME}</strong>. We are pleased to invite you to an interview for the position of <strong>${esc(d.designation)}</strong>.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0;width:100%">
${rows.map(([label, , htmlValue]) => `<tr><td style="padding:7px 12px;border:1px solid #e2e8f0;background:#f8fafc;width:140px;font-weight:600">${label}</td><td style="padding:7px 12px;border:1px solid #e2e8f0">${htmlValue}</td></tr>`).join("\n")}
</table>
${d.message ? `<p style="white-space:pre-wrap">${esc(d.message)}</p>` : ""}
<p>Please reply to this email to confirm your attendance. A calendar entry is attached for your convenience.</p>
<p>Kind regards,<br/><strong>${esc(d.senderName)}</strong><br/>${COMPANY_NAME}</p>
</div>`;

  const text = [
    `Dear ${d.candidateName},`,
    "",
    `Thank you for your interest in joining ${COMPANY_NAME}. We are pleased to invite you to an interview for the position of ${d.designation}.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(d.message ? ["", d.message] : []),
    "",
    "Please reply to this email to confirm your attendance. A calendar entry is attached for your convenience.",
    "",
    "Kind regards,",
    d.senderName,
    COMPANY_NAME,
  ].join("\n");

  return { subject, html, text, attachments: [buildIcs(d)] };
}
