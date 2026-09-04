export function invitationEmail(name: string, activationUrl: string) {
  return {
    subject: "You're invited to the DaCentric platform",
    html: `<p>Hi ${name},</p>
      <p>An administrator has created an account for you on the DaCentric platform
      (CRM, ERP, HRMS and Workflow — one login for all of them).</p>
      <p><a href="${activationUrl}">Activate your account and set a password</a></p>
      <p>This link expires in 72 hours. If it expires, ask your administrator to resend the invite.</p>`,
    text: `Activate your account: ${activationUrl} (expires in 72 hours)`,
  };
}

export function passwordResetEmail(name: string, resetUrl: string) {
  return {
    subject: "Reset your DaCentric password",
    html: `<p>Hi ${name},</p>
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>`,
    text: `Reset your password: ${resetUrl}`,
  };
}

export function accountLockedEmail(name: string, minutes: number) {
  return {
    subject: "Your DaCentric account has been locked",
    html: `<p>Hi ${name},</p>
      <p>Your account was locked for ${minutes} minutes after five consecutive failed sign-in
      attempts. If this wasn't you, please contact your administrator.</p>`,
    text: `Your account was locked for ${minutes} minutes after five failed login attempts.`,
  };
}

export function notificationDigestEmail(name: string, title: string, body: string, link: string) {
  return {
    subject: `[DaCentric Workflow] ${title}`,
    html: `<p>Hi ${name},</p><p>${body}</p><p><a href="${link}">Open in Workflow</a></p>`,
    text: `${body} — ${link}`,
  };
}
