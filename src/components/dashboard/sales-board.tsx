'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Textarea, apiRequest, useToast } from '@/components/ui';
import { LEAD_STAGES, LEAD_STAGE_LABELS, type LeadStage } from '@/lib/domain';
import { formatDate, formatMoney, relativeTime } from '@/lib/utils';

export type LeadItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: LeadStage;
  valueCents: number;
  score: number | null;
  scoreReason: string | null;
  notes: string | null;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
};

export function SalesBoard({ initial, currency }: { initial: LeadItem[]; currency: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [leads, setLeads] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<LeadItem | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    source: '',
    stage: 'NEW_LEAD' as LeadStage,
    value: '',
    notes: '',
    nextFollowUpAt: '',
  });

  const reload = async () => {
    const result = await apiRequest<{ leads: LeadItem[] }>('/api/leads', { method: 'GET' });
    if (result.ok) setLeads(result.data.leads ?? []);
    router.refresh();
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/leads', { body: form });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Lead added and scored', 'success');
    setOpen(false);
    setForm({ name: '', phone: '', email: '', source: '', stage: 'NEW_LEAD', value: '', notes: '', nextFollowUpAt: '' });
    await reload();
  };

  const moveStage = async (lead: LeadItem, stage: LeadStage) => {
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, stage } : item)));
    const result = await apiRequest(`/api/leads/${lead.id}`, { method: 'PATCH', body: { stage } });
    if (!result.ok) {
      push(result.error, 'danger');
      await reload();
      return;
    }
    push(`${lead.name} moved to ${LEAD_STAGE_LABELS[stage]}`, 'success');
    await reload();
  };

  const requestMessage = async (lead: LeadItem, intent: 'FOLLOW_UP' | 'QUOTE' | 'RECOMMENDATION' | 'REACTIVATION') => {
    setBusy(true);
    const result = await apiRequest<{ message: string }>(`/api/leads/${lead.id}`, {
      body: { action: 'message', channel: 'WHATSAPP', intent },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    setAiMessage(result.data.message);
    push('AI drafted a message — review before sending', 'success');
    await reload();
  };

  const addActivity = async (lead: LeadItem, content: string, type: string) => {
    const result = await apiRequest(`/api/leads/${lead.id}`, { body: { action: 'activity', type, content } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Activity logged', 'success');
    await reload();
  };

  const columns = LEAD_STAGES.filter((stage) => stage !== 'LOST');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {columns.map((stage) => (
            <Badge key={stage} tone={stage === 'WON' ? 'success' : 'neutral'}>
              {LEAD_STAGE_LABELS[stage]} {leads.filter((lead) => lead.stage === stage).length}
            </Badge>
          ))}
        </div>
        <Button onClick={() => setOpen(true)}>+ New lead</Button>
      </div>

      <div className="grid gap-4 overflow-x-auto lg:grid-cols-3 xl:grid-cols-3">
        {columns.map((stage) => (
          <div key={stage} className="min-w-[260px] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{LEAD_STAGE_LABELS[stage]}</h3>
              <span className="muted text-xs">
                {formatMoney(
                  leads.filter((lead) => lead.stage === stage).reduce((sum, lead) => sum + lead.valueCents, 0),
                  currency,
                )}
              </span>
            </div>
            {leads.filter((lead) => lead.stage === stage).length === 0 ? (
              <p className="muted rounded-xl border border-dashed p-3 text-xs">No leads in this stage.</p>
            ) : (
              leads
                .filter((lead) => lead.stage === stage)
                .map((lead) => (
                  <Card key={lead.id} className="space-y-2 p-3">
                    <button className="w-full text-left" onClick={() => setSelected(lead)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{lead.name}</p>
                        {lead.score !== null ? (
                          <Badge tone={lead.score >= 70 ? 'success' : lead.score >= 40 ? 'info' : 'neutral'}>
                            {lead.score}/100
                          </Badge>
                        ) : null}
                      </div>
                      <p className="muted mt-1 text-xs">{lead.phone ?? lead.email ?? 'No contact detail'}</p>
                      <p className="muted mt-1 text-xs">
                        {formatMoney(lead.valueCents, currency)} · {lead.source ?? 'unknown source'}
                      </p>
                    </button>
                    <Select
                      value={lead.stage}
                      onChange={(event) => moveStage(lead, event.target.value as LeadStage)}
                      aria-label={`Move ${lead.name} to another stage`}
                      className="text-xs"
                    >
                      {LEAD_STAGES.map((option) => (
                        <option key={option} value={option}>
                          {LEAD_STAGE_LABELS[option]}
                        </option>
                      ))}
                    </Select>
                  </Card>
                ))
            )}
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New lead"
        description="Leads are scored automatically from value, stage, source and contact history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy}>
              Add lead
            </Button>
          </>
        }
      >
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Source">
            <Input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Referral, Instagram…" />
          </Field>
          <Field label="Estimated value">
            <Input value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} placeholder="2500" />
          </Field>
          <Field label="Stage">
            <Select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value as LeadStage })}>
              {LEAD_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {LEAD_STAGE_LABELS[stage]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up">
            <Input type="date" value={form.nextFollowUpAt} onChange={(event) => setForm({ ...form, nextFollowUpAt: event.target.value })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setAiMessage(null);
        }}
        title={selected?.name ?? 'Lead'}
        description={selected ? `${LEAD_STAGE_LABELS[selected.stage]} · ${formatMoney(selected.valueCents, currency)}` : undefined}
        size="lg"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-3">
                <p className="muted text-xs">Phone</p>
                <p className="text-sm">{selected.phone ?? '—'}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="muted text-xs">Email</p>
                <p className="text-sm">{selected.email ?? '—'}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="muted text-xs">Last contacted</p>
                <p className="text-sm">{selected.lastContactedAt ? relativeTime(selected.lastContactedAt) : 'Never'}</p>
              </div>
            </div>

            {selected.score !== null ? (
              <Card>
                <CardHeader title={`AI lead score: ${selected.score}/100`} description="Calculated from stage, value, recency and source." />
                <p className="muted text-sm">{selected.scoreReason}</p>
              </Card>
            ) : null}

            <div>
              <p className="text-sm font-semibold">Generate an AI message</p>
              <p className="muted mt-1 text-xs">Nothing is sent automatically — copy or review the draft first.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['FOLLOW_UP', 'QUOTE', 'RECOMMENDATION', 'REACTIVATION'] as const).map((intent) => (
                  <Button key={intent} variant="secondary" size="sm" loading={busy} onClick={() => requestMessage(selected, intent)}>
                    <Sparkles className="h-3.5 w-3.5" /> {intent.replace('_', ' ').toLowerCase()}
                  </Button>
                ))}
              </div>
              {aiMessage ? (
                <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-900 dark:bg-brand-950/40">
                  <p className="font-medium">Draft message</p>
                  <p className="mt-1 whitespace-pre-wrap">{aiMessage}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      navigator.clipboard.writeText(aiMessage);
                      push('Message copied', 'success');
                    }}
                  >
                    Copy message
                  </Button>
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-sm font-semibold">Log an activity</p>
              <form
                className="mt-3 flex gap-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget as HTMLFormElement);
                  const content = String(data.get('content') ?? '').trim();
                  const type = String(data.get('type') ?? 'NOTE');
                  if (!content) return;
                  await addActivity(selected, content, type);
                  (event.target as HTMLFormElement).reset();
                }}
              >
                <Select name="type" className="w-32">
                  {['NOTE', 'CALL', 'EMAIL', 'SMS', 'MEETING'].map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
                <Input name="content" placeholder="What happened?" className="flex-1" />
                <Button type="submit">Log</Button>
              </form>
            </div>

            <p className="muted text-xs">
              Created {formatDate(selected.createdAt)}
              {selected.nextFollowUpAt ? ` · follow-up due ${formatDate(selected.nextFollowUpAt)}` : ''}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
