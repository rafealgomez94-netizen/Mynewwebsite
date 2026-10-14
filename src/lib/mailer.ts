import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Transactional email.
 *
 * When SMTP credentials are absent (development, preview deployments) messages
 * are written to the server console and the delivery is reported as "logged" so
 * flows such as email verification remain testable without a mail provider.
 */
export type MailResult = { delivered: boolean; transport: 'smtp' | 'console' };

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> {
  const from = process.env.SMTP_FROM || 'Workspace Digital <no-reply@workspace.digital>';
  const transport = getTransporter();
  if (!transport) {
    console.info(
      `[mail:console] to=${input.to} subject="${input.subject}"\n${input.text ?? input.html.replace(/<[^>]+>/g, ' ')}`,
    );
    return { delivered: false, transport: 'console' };
  }
  await transport.sendMail({ from, to: input.to, subject: input.subject, html: input.html, text: input.text });
  return { delivered: true, transport: 'smtp' };
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb">
        <tr><td style="padding:28px 32px 8px">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#1e63ef;font-weight:700">Workspace Digital</div>
          <h1 style="margin:12px 0 0;font-size:22px;color:#0f1729">${title}</h1>
        </td></tr>
        <tr><td style="padding:12px 32px 24px;color:#404a5d;font-size:15px;line-height:1.6">${body}
        ${
          cta
            ? `<p style="margin:24px 0 8px"><a href="${cta.url}" style="background:#1e63ef;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${cta.label}</a></p>
               <p style="color:#64738d;font-size:13px;word-break:break-all">${cta.url}</p>`
            : ''
        }
        </td></tr>
        <tr><td style="padding:16px 32px 28px;color:#8492a9;font-size:12px;border-top:1px solid #eceef2">
          Workspace Digital — the AI business operating system. If you did not request this email you can ignore it safely.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export async function sendVerificationEmail(to: string, name: string, url: string) {
  return sendMail({
    to,
    subject: 'Verify your Workspace Digital account',
    html: layout(
      `Welcome, ${name}!`,
      'Confirm your email address to activate AI tools, customer support automation and reports for your business.',
      { label: 'Verify my email', url },
    ),
    text: `Welcome to Workspace Digital, ${name}. Verify your email: ${url}`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, url: string) {
  return sendMail({
    to,
    subject: 'Reset your Workspace Digital password',
    html: layout(
      'Reset your password',
      `Hi ${name}, we received a request to reset your password. This link expires in 60 minutes.`,
      { label: 'Choose a new password', url },
    ),
    text: `Reset your Workspace Digital password: ${url}`,
  });
}

export async function sendMemberInviteEmail(to: string, businessName: string, inviterName: string, url: string) {
  return sendMail({
    to,
    subject: `${inviterName} invited you to ${businessName} on Workspace Digital`,
    html: layout(
      `You have been invited to ${businessName}`,
      `${inviterName} added you to the ${businessName} workspace. Accept the invitation to access the dashboard, appointments and AI assistant.`,
      { label: 'Accept invitation', url },
    ),
    text: `${inviterName} invited you to ${businessName} on Workspace Digital: ${url}`,
  });
}

export async function sendEscalationEmail(input: {
  to: string;
  businessName: string;
  subject: string;
  customerName: string;
  customerContact: string;
  question: string;
  ticketId: string;
}) {
  return sendMail({
    to: input.to,
    subject: `[Human assistance needed] ${input.subject}`,
    html: layout(
      'A customer needs a human',
      `<p><strong>Business:</strong> ${input.businessName}</p>
       <p><strong>Customer:</strong> ${input.customerName} (${input.customerContact})</p>
       <p><strong>Question:</strong> ${input.question}</p>
       <p><strong>Ticket:</strong> ${input.ticketId}</p>
       <p>The AI assistant could not answer confidently, so it captured the request instead of guessing.</p>`,
    ),
    text: `Customer ${input.customerName} (${input.customerContact}) needs help: ${input.question}`,
  });
}

export async function sendAppointmentReminderEmail(input: {
  to: string;
  customerName: string;
  businessName: string;
  when: string;
  service: string;
}) {
  return sendMail({
    to: input.to,
    subject: `Reminder: your appointment at ${input.businessName}`,
    html: layout(
      'Appointment reminder',
      `<p>Hi ${input.customerName}, this is a reminder for <strong>${input.service}</strong> at ${input.businessName} on ${input.when}.</p>
       <p>Reply to this email if you need to reschedule.</p>`,
    ),
    text: `Reminder: ${input.service} at ${input.businessName} on ${input.when}.`,
  });
}
