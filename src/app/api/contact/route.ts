import { assertRateLimit, handleError, ok, parseBody } from '@/lib/api/http';
import { contactMessageSchema } from '@/lib/validation';
import { createContactMessage } from '@/lib/db/repositories/platform';
import { sendMail } from '@/lib/mailer';
import { SUPPORT_EMAIL } from '@/lib/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public landing-page contact / demo request form. */
export async function POST(request: Request) {
  try {
    assertRateLimit(request, 'contact', 8, 10 * 60 * 1000);
    const input = await parseBody(request, contactMessageSchema);
    const id = createContactMessage({
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      company: input.company || null,
      topic: input.topic,
      message: input.message,
      source: input.source || 'website',
    });

    await sendMail({
      to: SUPPORT_EMAIL,
      subject: `[${input.topic}] ${input.company || input.name} — Workspace Digital`,
      html: `<p><strong>${input.name}</strong> (${input.email}${input.phone ? ` · ${input.phone}` : ''})</p>
             <p>Company: ${input.company || '—'}</p>
             <p>Topic: ${input.topic}</p>
             <p>${input.message}</p>`,
      text: `${input.name} (${input.email}) — ${input.message}`,
    }).catch((error) => console.warn('[contact] notification email failed', error));

    return ok({ received: true, id }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
