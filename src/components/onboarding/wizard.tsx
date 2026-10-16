'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  apiRequest,
  useToast,
} from '@/components/ui';
import { BUSINESS_TYPES } from '@/lib/domain';
import { centsToInput } from '@/lib/utils';
import { UploadCloud } from 'lucide-react';

type ServiceDraft = { name: string; price: string; durationMinutes: string };
type StaffDraft = { name: string; title: string; email: string; phone: string };
type ProductDraft = { name: string; price: string; cost: string; quantity: string; minStock: string };

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const STEPS = [
  'Business details',
  'Location & contact',
  'Opening hours',
  'Services & prices',
  'Products',
  'FAQs',
  'Staff',
  'Communication',
  'Documents',
];

/**
 * Currencies a business in Liberia and the wider region actually trades in. Liberian dollars come
 * first because that is the default for a new workspace; the list is a convenience, not a limit —
 * the API accepts any ISO 4217 code.
 */
const CURRENCY_OPTIONS = [
  { code: 'LRD', label: 'LRD — Liberian dollar' },
  { code: 'USD', label: 'USD — US dollar' },
  { code: 'GHS', label: 'GHS — Ghanaian cedi' },
  { code: 'NGN', label: 'NGN — Nigerian naira' },
  { code: 'SLE', label: 'SLE — Sierra Leonean leone' },
  { code: 'GMD', label: 'GMD — Gambian dalasi' },
  { code: 'XOF', label: 'XOF — West African CFA franc' },
  { code: 'ZAR', label: 'ZAR — South African rand' },
  { code: 'KES', label: 'KES — Kenyan shilling' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — Pound sterling' },
  { code: 'CAD', label: 'CAD — Canadian dollar' },
  { code: 'AUD', label: 'AUD — Australian dollar' },
  { code: 'INR', label: 'INR — Indian rupee' },
];

export function OnboardingWizard({
  initial,
}: {
  initial?: {
    name?: string;
    type?: string;
    description?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    timezone?: string | null;
    currency?: string | null;
    hours?: { day: string; open: string; close: string; closed: boolean }[];
    comms?: {
      preferredChannel: string;
      whatsapp: string;
      escalateTo: string;
      autoReply: boolean;
      sendAppointmentReminders: boolean;
      reminderLeadHours: number;
    } | null;
  };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState<string | null>(null);

  const [business, setBusiness] = useState({
    name: initial?.name ?? '',
    type: initial?.type ?? 'salon',
    description: initial?.description ?? '',
    address: initial?.address ?? '',
    city: initial?.city ?? '',
    country: initial?.country ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    website: initial?.website ?? '',
    timezone: initial?.timezone ?? 'UTC',
    currency: initial?.currency ?? 'LRD',
  });

  const [hours, setHours] = useState(
    initial?.hours ?? DAYS.map((day) => ({
      day: day.key,
      open: '09:00',
      close: '17:00',
      closed: day.key === 'sun',
    })),
  );

  const [services, setServices] = useState<ServiceDraft[]>([{ name: '', price: '', durationMinutes: '60' }]);
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([{ question: '', answer: '' }]);
  const [staff, setStaff] = useState<StaffDraft[]>([{ name: '', title: '', email: '', phone: '' }]);
  const [comms, setComms] = useState({
    preferredChannel: initial?.comms?.preferredChannel ?? 'WHATSAPP',
    whatsapp: initial?.comms?.whatsapp ?? '',
    escalateTo: initial?.comms?.escalateTo ?? '',
    autoReply: initial?.comms?.autoReply ?? true,
    sendAppointmentReminders: initial?.comms?.sendAppointmentReminders ?? true,
    reminderLeadHours: initial?.comms?.reminderLeadHours ?? 24,
  });
  const [files, setFiles] = useState<File[]>([]);

  const cash = (value: string) => centsToInput(Number(value.replace(/[^0-9.]/g, '') || '0') * 100);

  const next = async () => {
    setError(null);
    setBusy(true);
    try {
      // Step 1 — create the business workspace
      if (step === 0) {
        if (business.name.trim().length < 2) {
          setError('Enter your business name to continue.');
          return;
        }
        const result = await apiRequest<{ business: { id: string } }>('/api/business/profile', {
          body: { ...business, onboardingStep: 2 },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setProgressNote('Business created. Continue to add contact details.');
        setStep(1);
        return;
      }

      if (step === 1) {
        const result = await apiRequest('/api/business/profile', {
          method: 'PATCH',
          body: { ...business, onboardingStep: 3 },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStep(2);
        return;
      }

      if (step === 2) {
        const result = await apiRequest('/api/business/profile', {
          method: 'PATCH',
          body: { hours, onboardingStep: 4 },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStep(3);
        return;
      }

      if (step === 3) {
        const valid = services.filter((service) => service.name.trim().length > 1);
        for (const service of valid) {
          const result = await apiRequest('/api/services', {
            body: {
              name: service.name,
              price: service.price || '0',
              durationMinutes: Number(service.durationMinutes || 60),
              active: true,
            },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
        }
        if (valid.length) push(`${valid.length} service(s) added`, 'success');
        setStep(4);
        return;
      }

      if (step === 4) {
        const valid = products.filter((product) => product.name.trim().length > 1);
        for (const product of valid) {
          const result = await apiRequest('/api/products', {
            body: {
              name: product.name,
              price: product.price || '0',
              cost: product.cost || '0',
              quantity: Number(product.quantity || 0),
              minStock: Number(product.minStock || 0),
            },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
        }
        if (valid.length) push(`${valid.length} product(s) added`, 'success');
        setStep(5);
        return;
      }

      if (step === 5) {
        const valid = faqs.filter((faq) => faq.question.trim().length > 3 && faq.answer.trim().length > 1);
        for (const faq of valid) {
          const result = await apiRequest('/api/knowledge', {
            body: { kind: 'faq', data: { ...faq, published: true } },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
        }
        if (valid.length) push(`${valid.length} FAQ(s) saved to the knowledge base`, 'success');
        setStep(6);
        return;
      }

      if (step === 6) {
        const valid = staff.filter((member) => member.name.trim().length > 1);
        for (const member of valid) {
          const result = await apiRequest('/api/staff', {
            body: {
              name: member.name,
              title: member.title,
              email: member.email,
              phone: member.phone,
              specialties: [],
              active: true,
            },
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
        }
        if (valid.length) push(`${valid.length} staff member(s) added`, 'success');
        setStep(7);
        return;
      }

      if (step === 7) {
        const result = await apiRequest('/api/business/profile', {
          method: 'PATCH',
          body: { comms, onboardingStep: 9 },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStep(8);
        return;
      }

      // Step 9 — documents then finish
      if (step === 8) {
        if (files.length) {
          const formData = new FormData();
          files.forEach((file) => formData.append('files', file));
          const upload = await apiRequest('/api/knowledge/upload', { formData });
          if (!upload.ok) {
            setError(upload.error);
            return;
          }
          push(`${files.length} document(s) added to your knowledge base`, 'success');
        }
        const finish = await apiRequest('/api/business/profile', {
          method: 'PATCH',
          body: { complete: true },
        });
        if (!finish.ok) {
          setError(finish.error);
          return;
        }
        router.push('/dashboard');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (step === 0) return;
    if (step === 8) {
      await next();
      return;
    }
    setStep(step + 1);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              index === step
                ? 'border-brand-600 bg-brand-600 text-white'
                : index < step
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'muted'
            }`}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <div className="card p-6">
        <div className="mb-5">
          <Badge tone="brand">Step {step + 1} of {STEPS.length}</Badge>
          <h1 className="mt-3 text-2xl font-semibold">{STEPS[step]}</h1>
          <p className="muted mt-1 text-sm">
            Everything here feeds your dashboard and your AI assistant. You can change any of it later in Settings.
          </p>
        </div>

        {error ? (
          <Alert tone="danger" title="Could not save">
            {error}
          </Alert>
        ) : null}
        {progressNote ? (
          <Alert tone="success" title="Saved">
            {progressNote}
          </Alert>
        ) : null}

        <div className="mt-6 space-y-5">
          {step === 0 ? (
            <>
              <Field label="Business name" required>
                <Input
                  value={business.name}
                  onChange={(event) => setBusiness({ ...business, name: event.target.value })}
                  placeholder="Riverside Salon"
                  autoFocus
                />
              </Field>
              <Field label="Business type" required hint="Determines the tools and language suggested inside your dashboard.">
                <Select value={business.type} onChange={(event) => setBusiness({ ...business, type: event.target.value })}>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="What does your business do?" hint="Describe your services in your own words — the AI uses this context.">
                <Textarea
                  value={business.description}
                  onChange={(event) => setBusiness({ ...business, description: event.target.value })}
                  placeholder="Neighbourhood hair studio offering cuts, colour, keratin treatments and bridal styling."
                />
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Street address" className="sm:col-span-2">
                <Input value={business.address} onChange={(event) => setBusiness({ ...business, address: event.target.value })} />
              </Field>
              <Field label="City">
                <Input value={business.city} onChange={(event) => setBusiness({ ...business, city: event.target.value })} />
              </Field>
              <Field label="Country">
                <Input value={business.country} onChange={(event) => setBusiness({ ...business, country: event.target.value })} />
              </Field>
              <Field label="Business phone">
                <Input value={business.phone} onChange={(event) => setBusiness({ ...business, phone: event.target.value })} placeholder="0888937524" />
              </Field>
              <Field label="Business email">
                <Input type="email" value={business.email} onChange={(event) => setBusiness({ ...business, email: event.target.value })} />
              </Field>
              <Field label="Website" hint="Optional">
                <Input value={business.website} onChange={(event) => setBusiness({ ...business, website: event.target.value })} placeholder="https://" />
              </Field>
              <Field label="Timezone">
                <Input value={business.timezone} onChange={(event) => setBusiness({ ...business, timezone: event.target.value })} placeholder="Africa/Monrovia" />
              </Field>
              <Field label="Currency" hint="Prices, invoices and AI answers use it">
                <Select value={business.currency} onChange={(event) => setBusiness({ ...business, currency: event.target.value })}>
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              {hours.map((entry, index) => {
                const day = DAYS.find((item) => item.key === entry.day);
                return (
                  <div key={entry.day} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                    <span className="w-24 text-sm font-medium">{day?.label}</span>
                    <Input
                      type="time"
                      value={entry.open}
                      disabled={entry.closed}
                      onChange={(event) => {
                        const copy = [...hours];
                        copy[index] = { ...entry, open: event.target.value };
                        setHours(copy);
                      }}
                      className="w-32"
                    />
                    <span className="muted text-sm">to</span>
                    <Input
                      type="time"
                      value={entry.close}
                      disabled={entry.closed}
                      onChange={(event) => {
                        const copy = [...hours];
                        copy[index] = { ...entry, close: event.target.value };
                        setHours(copy);
                      }}
                      className="w-32"
                    />
                    <Checkbox
                      label="Closed"
                      checked={entry.closed}
                      onChange={(event) => {
                        const copy = [...hours];
                        copy[index] = { ...entry, closed: event.target.checked };
                        setHours(copy);
                      }}
                    />
                  </div>
                );
              })}
              <p className="muted text-xs">
                Opening hours control appointment availability and what the AI tells customers who ask when you are open.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              {services.map((service, index) => (
                <div key={`service-${index}`} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <Input
                    placeholder="Service name (e.g. Haircut & style)"
                    value={service.name}
                    onChange={(event) => {
                      const copy = [...services];
                      copy[index] = { ...service, name: event.target.value };
                      setServices(copy);
                    }}
                  />
                  <Input
                    placeholder="Price"
                    value={service.price}
                    onChange={(event) => {
                      const copy = [...services];
                      copy[index] = { ...service, price: cash(event.target.value) };
                      setServices(copy);
                    }}
                  />
                  <Input
                    placeholder="Minutes"
                    value={service.durationMinutes}
                    onChange={(event) => {
                      const copy = [...services];
                      copy[index] = { ...service, durationMinutes: event.target.value };
                      setServices(copy);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setServices(services.filter((_, position) => position !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setServices([...services, { name: '', price: '', durationMinutes: '60' }])}>
                Add another service
              </Button>
              <p className="muted text-xs">
                Prices entered here are the only prices the AI will ever quote to customers.
              </p>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-3">
              {products.length === 0 ? (
                <Alert tone="info" title="Selling products?">
                  Add stock items (retail, drinks, retail products). You can also skip this step — restaurants, salons
                  and service businesses often do not need it.
                </Alert>
              ) : null}
              {products.map((product, index) => (
                <div key={`product-${index}`} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
                  <Input
                    placeholder="Product name"
                    value={product.name}
                    onChange={(event) => {
                      const copy = [...products];
                      copy[index] = { ...product, name: event.target.value };
                      setProducts(copy);
                    }}
                  />
                  <Input
                    placeholder="Sell price"
                    value={product.price}
                    onChange={(event) => {
                      const copy = [...products];
                      copy[index] = { ...product, price: cash(event.target.value) };
                      setProducts(copy);
                    }}
                  />
                  <Input
                    placeholder="Cost"
                    value={product.cost}
                    onChange={(event) => {
                      const copy = [...products];
                      copy[index] = { ...product, cost: cash(event.target.value) };
                      setProducts(copy);
                    }}
                  />
                  <Input
                    placeholder="Qty"
                    value={product.quantity}
                    onChange={(event) => {
                      const copy = [...products];
                      copy[index] = { ...product, quantity: event.target.value };
                      setProducts(copy);
                    }}
                  />
                  <Input
                    placeholder="Min"
                    value={product.minStock}
                    onChange={(event) => {
                      const copy = [...products];
                      copy[index] = { ...product, minStock: event.target.value };
                      setProducts(copy);
                    }}
                  />
                  <Button type="button" variant="ghost" onClick={() => setProducts(products.filter((_, position) => position !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setProducts([...products, { name: '', price: '', cost: '', quantity: '0', minStock: '5' }])}
              >
                Add product
              </Button>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-3">
              <Alert tone="info" title="These go straight into your AI knowledge base">
                Frequent questions such as parking, cancellation policy, payment methods or allergies. The AI answers
                customers from these, and escalates to your team when it is unsure.
              </Alert>
              {faqs.map((faq, index) => (
                <div key={`faq-${index}`} className="space-y-2 rounded-xl border p-3">
                  <Input
                    placeholder="Question — e.g. Do you take walk-ins?"
                    value={faq.question}
                    onChange={(event) => {
                      const copy = [...faqs];
                      copy[index] = { ...faq, question: event.target.value };
                      setFaqs(copy);
                    }}
                  />
                  <Textarea
                    placeholder="Answer"
                    value={faq.answer}
                    onChange={(event) => {
                      const copy = [...faqs];
                      copy[index] = { ...faq, answer: event.target.value };
                      setFaqs(copy);
                    }}
                  />
                  <Button type="button" variant="ghost" onClick={() => setFaqs(faqs.filter((_, position) => position !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setFaqs([...faqs, { question: '', answer: '' }])}>
                Add FAQ
              </Button>
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-3">
              {staff.map((member, index) => (
                <div key={`staff-${index}`} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                  <Input
                    placeholder="Staff member name"
                    value={member.name}
                    onChange={(event) => {
                      const copy = [...staff];
                      copy[index] = { ...member, name: event.target.value };
                      setStaff(copy);
                    }}
                  />
                  <Input
                    placeholder="Role / title"
                    value={member.title}
                    onChange={(event) => {
                      const copy = [...staff];
                      copy[index] = { ...member, title: event.target.value };
                      setStaff(copy);
                    }}
                  />
                  <Input
                    placeholder="Email"
                    value={member.email}
                    onChange={(event) => {
                      const copy = [...staff];
                      copy[index] = { ...member, email: event.target.value };
                      setStaff(copy);
                    }}
                  />
                  <Input
                    placeholder="Phone"
                    value={member.phone}
                    onChange={(event) => {
                      const copy = [...staff];
                      copy[index] = { ...member, phone: event.target.value };
                      setStaff(copy);
                    }}
                  />
                  <Button type="button" variant="ghost" onClick={() => setStaff(staff.filter((_, position) => position !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={() => setStaff([...staff, { name: '', title: '', email: '', phone: '' }])}>
                Add staff member
              </Button>
            </div>
          ) : null}

          {step === 7 ? (
            <div className="space-y-4">
              <Field label="Preferred customer communication channel">
                <Select value={comms.preferredChannel} onChange={(event) => setComms({ ...comms, preferredChannel: event.target.value })}>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="PHONE">Phone</option>
                  <option value="WEB_CHAT">Website chat</option>
                </Select>
              </Field>
              <Field label="Business WhatsApp number">
                <Input value={comms.whatsapp} onChange={(event) => setComms({ ...comms, whatsapp: event.target.value })} placeholder="0774075285" />
              </Field>
              <Field label="Escalate unanswered AI questions to" hint="Email address that receives support escalations.">
                <Input value={comms.escalateTo} onChange={(event) => setComms({ ...comms, escalateTo: event.target.value })} placeholder="rafealgomez94@gmail.com" />
              </Field>
              <div className="space-y-2">
                <Checkbox
                  label="Let the AI answer customer questions automatically"
                  checked={comms.autoReply}
                  onChange={(event) => setComms({ ...comms, autoReply: event.target.checked })}
                />
                <Checkbox
                  label="Send appointment reminders"
                  checked={comms.sendAppointmentReminders}
                  onChange={(event) => setComms({ ...comms, sendAppointmentReminders: event.target.checked })}
                />
              </div>
              <Field label="Reminder lead time (hours before appointment)">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={comms.reminderLeadHours}
                  onChange={(event) => setComms({ ...comms, reminderLeadHours: Number(event.target.value) })}
                />
              </Field>
            </div>
          ) : null}

          {step === 8 ? (
            <div className="space-y-4">
              <Alert tone="info" title="Train your AI on your own documents">
                Upload your menu, price list, service catalogue, policies, FAQs or product information (TXT, MD, CSV,
                JSON, PDF, DOCX · up to 8 MB each). Everything you upload becomes retrievable knowledge for the AI.
              </Alert>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition hover:bg-[rgb(var(--surface-muted))]">
                <UploadCloud className="h-6 w-6 text-brand-600" aria-hidden />
                <span className="text-sm font-medium">Choose files to upload</span>
                <span className="muted text-xs">Menu, price list, policies, FAQs…</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json,.pdf,.docx,.tsv"
                  className="hidden"
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
              </label>
              {files.length ? (
                <ul className="muted space-y-1 text-sm">
                  {files.map((file) => (
                    <li key={file.name} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs">{(file.size / 1024).toFixed(0)} KB</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <Button type="button" variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || busy}>
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            {step > 0 && step < 8 ? (
              <Button type="button" variant="secondary" onClick={skip} disabled={busy}>
                Skip for now
              </Button>
            ) : null}
            <Button type="button" onClick={next} loading={busy}>
              {step === 8 ? 'Finish and open dashboard' : 'Save and continue'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
