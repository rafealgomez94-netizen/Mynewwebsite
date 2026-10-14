'use client';

import { useState } from 'react';
import { Button, Field, Input, Select, Textarea, apiRequest, useToast } from '@/components/ui';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '@/lib/domain';

export function DemoForm({ source = 'landing-demo' }: { source?: string }) {
  const { push } = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    topic: 'demo',
    message: '',
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const result = await apiRequest('/api/contact', { body: { ...form, source } });
    setLoading(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    setDone(true);
    push('Thank you — your request has been sent to our team.', 'success');
  };

  if (done) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold">Request received ✅</p>
        <p className="muted mt-2 text-sm">
          A Workspace Digital manager will contact you within one business day. For an immediate reply, message us on
          WhatsApp at <strong>{SUPPORT_WHATSAPP}</strong> or email <strong>{SUPPORT_EMAIL}</strong>.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => setDone(false)}>
          Send another request
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Amara Nkosi"
            autoComplete="name"
          />
        </Field>
        <Field label="Work email" required>
          <Input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="you@business.com"
            autoComplete="email"
          />
        </Field>
        <Field label="Phone / WhatsApp">
          <Input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="0774075285"
            autoComplete="tel"
          />
        </Field>
        <Field label="Business name">
          <Input
            value={form.company}
            onChange={(event) => setForm({ ...form, company: event.target.value })}
            placeholder="Riverside Salon"
          />
        </Field>
      </div>
      <Field label="What would you like to talk about?">
        <Select value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })}>
          <option value="demo">Book a demo</option>
          <option value="sales">Pricing and plans</option>
          <option value="support">Onboarding help</option>
          <option value="partnership">Partnership or reseller</option>
          <option value="other">Something else</option>
        </Select>
      </Field>
      <Field label="Tell us about your business" required hint="Industry, team size and what you want to automate first.">
        <Textarea
          required
          value={form.message}
          onChange={(event) => setForm({ ...form, message: event.target.value })}
          placeholder="We run two restaurants and want AI support plus bookings..."
        />
      </Field>
      <Button type="submit" loading={loading} className="w-full sm:w-auto">
        Request my demo
      </Button>
      <p className="muted text-xs">
        By submitting you agree to be contacted about Workspace Digital. We never share your details.
      </p>
    </form>
  );
}
