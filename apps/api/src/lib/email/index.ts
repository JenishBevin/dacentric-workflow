import { env } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Email abstraction — swap the adapter without touching call sites. */
export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailAdapter implements EmailAdapter {
  async send(message: EmailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `\n----- [DEV EMAIL] -----\nTo: ${message.to}\nSubject: ${message.subject}\n${message.text ?? message.html}\n------------------------\n`
    );
  }
}

class SmtpEmailAdapter implements EmailAdapter {
  private transporterPromise: Promise<import("nodemailer").Transporter> | null = null;

  private async transporter() {
    if (!this.transporterPromise) {
      // Lazy-require so environments without SMTP configured never pay the cost.
      const nodemailer = await import("nodemailer");
      this.transporterPromise = Promise.resolve(
        nodemailer.createTransport({
          host: env.smtp.host,
          port: env.smtp.port,
          secure: env.smtp.port === 465,
          auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
        })
      );
    }
    return this.transporterPromise;
  }

  async send(message: EmailMessage): Promise<void> {
    const nodemailer = await import("nodemailer");
    const transporter = await this.transporter();
    const info = await transporter.sendMail({
      from: env.smtp.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    // Ethereal (and a couple of other nodemailer-friendly test services)
    // hand back a direct link to view the exact message that was "sent" —
    // print it so a temporary/no-real-inbox SMTP setup is still genuinely
    // usable without logging into a webmail UI.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      // eslint-disable-next-line no-console
      console.log(`\n----- [SMTP PREVIEW] -----\nTo: ${message.to}\nSubject: ${message.subject}\n${previewUrl}\n---------------------------\n`);
    }
  }
}

/** Sends through every given adapter. The console copy is best-effort and never
 *  blocks or fails the real send — handy in dev so you always have the activation
 *  link on screen even if the frontend happens to be down when the SMTP email arrives. */
class CompositeEmailAdapter implements EmailAdapter {
  constructor(private adapters: EmailAdapter[]) {}

  async send(message: EmailMessage): Promise<void> {
    const results = await Promise.allSettled(this.adapters.map((a) => a.send(message)));
    const firstFailure = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    // Only fail the request if every adapter failed; if at least one succeeded
    // (e.g. console always does), don't block user creation over the other one.
    if (firstFailure && results.every((r) => r.status === "rejected")) {
      throw firstFailure.reason;
    }
  }
}

let adapter: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (!adapter) {
    if (env.emailProvider === "both") {
      adapter = new CompositeEmailAdapter([new ConsoleEmailAdapter(), new SmtpEmailAdapter()]);
    } else {
      adapter = env.emailProvider === "smtp" ? new SmtpEmailAdapter() : new ConsoleEmailAdapter();
    }
  }
  return adapter;
}