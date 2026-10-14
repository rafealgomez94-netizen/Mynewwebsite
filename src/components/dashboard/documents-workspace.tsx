'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, StatusBadge, Textarea, apiRequest, useToast } from '@/components/ui';
import { DOCUMENT_TYPES, documentTypeLabel } from '@/lib/domain';
import { formatMoney } from '@/lib/utils';

type DocumentRow = {
  id: string;
  type: string;
  number: string;
  title: string;
  status: string;
  customer_name: string | null;
  total_cents: number;
  currency: string;
  issued_at: string | null;
  content: string | null;
};

export function DocumentsWorkspace({
  initial,
  customers,
  businessName,
  currency,
  usage,
}: {
  initial: DocumentRow[];
  customers: { id: string; name: string }[];
  businessName: string;
  currency: string;
  usage: { used: number; limit: number };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [documents, setDocuments] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const [form, setForm] = useState({
    type: 'INVOICE',
    customerId: '',
    title: '',
    total: '',
    tax: '0',
    notes: '',
    dueDate: '',
    instructions: '',
  });

  const refresh = async () => {
    const result = await apiRequest<{ documents: DocumentRow[] }>('/api/documents', { method: 'GET' });
    if (result.ok) setDocuments(result.data.documents ?? []);
    router.refresh();
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest<{ document: DocumentRow }>('/api/documents', { body: form });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(`${documentTypeLabel(form.type)} generated`, 'success');
    setOpen(false);
    setForm({ type: 'INVOICE', customerId: '', title: '', total: '', tax: '0', notes: '', dueDate: '', instructions: '' });
    await refresh();
    setPreview(result.data.document);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    const result = await apiRequest('/api/documents', { method: 'DELETE', body: { id } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Document deleted', 'success');
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="muted text-sm">
            {documents.length} documents in this workspace · AI messages used {usage.used} / {usage.limit}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New document
        </Button>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b">
                {['Number', 'Type', 'Title', 'Customer', 'Total', 'Issued', 'Status', ''].map((column) => (
                  <th key={column} className="table-head px-4 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="table-row border-b last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs">{document.number}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{document.type}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{document.title}</td>
                  <td className="px-4 py-3">{document.customer_name ?? '—'}</td>
                  <td className="px-4 py-3">{formatMoney(document.total_cents, document.currency || currency)}</td>
                  <td className="muted px-4 py-3 text-xs">{(document.issued_at ?? '').slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={document.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setPreview(document)} aria-label="Preview">
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      <a href={`/api/documents/pdf?id=${document.id}`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="ghost" aria-label="Download PDF">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button size="sm" variant="ghost" onClick={() => remove(document.id)} aria-label="Delete document">
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {documents.length === 0 ? (
          <p className="muted p-5 text-sm">
            No documents yet. Generate an invoice, quotation, receipt, proposal, report, SOP or customer message — PDF
            export is included.
          </p>
        ) : null}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate a document"
        description="Totals come from what you type here. The AI can also pick up your last order for a customer."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={generate} loading={busy}>
              Generate document
            </Button>
          </>
        }
      >
        <form onSubmit={generate} className="grid gap-4 sm:grid-cols-2">
          <Field label="Document type" required>
            <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {documentTypeLabel(type)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer">
            <Select value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}>
              <option value="">Not linked</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required className="sm:col-span-2">
            <Input
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Invoice for April bookings"
            />
          </Field>
          <Field label="Amount" hint="Excluding tax">
            <Input value={form.total} onChange={(event) => setForm({ ...form, total: event.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Tax">
            <Input value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Due / valid until">
            <Input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
          </Field>
          <Field label="Extra instructions for the AI">
            <Input
              value={form.instructions}
              onChange={(event) => setForm({ ...form, instructions: event.target.value })}
              placeholder="Mention the loyalty discount"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? `${documentTypeLabel(preview.type)} ${preview.number}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            {preview ? (
              <a href={`/api/documents/pdf?id=${preview.id}`} target="_blank" rel="noopener noreferrer">
                <Button>
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </a>
            ) : null}
          </>
        }
      >
        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <div>
                <p className="font-semibold">{businessName}</p>
                <p className="muted text-xs">
                  {preview.customer_name ?? 'Customer not linked'} · issued {(preview.issued_at ?? '').slice(0, 10)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted))]">Total</p>
                <p className="text-lg font-semibold">{formatMoney(preview.total_cents, preview.currency || currency)}</p>
              </div>
            </div>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border p-4 text-xs leading-relaxed">
              {preview.content ?? 'This document was generated before content previews were stored. Re-generate it to see the full body.'}
            </pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
