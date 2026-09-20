import { getEmailAdapter } from "../../lib/email";

const CONTACT_INBOX = "info@dac-onerra.com";

export interface SubmitContactInput {
  name: string;
  email: string;
  phone?: string;
  services: string[];
  otherService?: string;
  message: string;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function submitContact(input: SubmitContactInput): Promise<void> {
  const servicesList = [...input.services, ...(input.otherService ? [`Other: ${input.otherService}`] : [])];
  const servicesText = servicesList.length ? servicesList.join(", ") : "Not specified";

  const html = `
    <h2>New website enquiry — Onerra</h2>
    <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(input.phone || "Not provided")}</p>
    <p><strong>Services interested in:</strong> ${escapeHtml(servicesText)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>
  `;

  await getEmailAdapter().send({
    to: CONTACT_INBOX,
    subject: `Website enquiry from ${input.name}`,
    html,
    text: `Name: ${input.name}\nEmail: ${input.email}\nPhone: ${input.phone || "Not provided"}\nServices: ${servicesText}\n\n${input.message}`,
  });
}
