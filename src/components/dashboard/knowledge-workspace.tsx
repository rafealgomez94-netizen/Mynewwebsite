'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Trash2, UploadCloud } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Checkbox, Field, Input, Tabs, Textarea, apiRequest, useToast } from '@/components/ui';
import { formatDate } from '@/lib/utils';

type Source = {
  id: string;
  title: string;
  kind: string;
  file_type: string | null;
  size_bytes: number;
  chunk_count: number;
  status: string;
  created_at: string;
};

type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  published: number;
  asked_count: number;
};

export function KnowledgeWorkspace({
  initialSources,
  initialFaqs,
  stats,
  preview,
  limits,
}: {
  initialSources: Source[];
  initialFaqs: Faq[];
  stats: { sources: number; chunks: number; bytes: number; faqs: number };
  preview: string;
  limits: { storageMb: number; documents: number };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState('documents');
  const [sources, setSources] = useState(initialSources);
  const [faqs, setFaqs] = useState(initialFaqs);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [textForm, setTextForm] = useState({ title: '', kind: 'MANUAL', body: '' });
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: '', published: true });

  const refresh = async () => {
    const result = await apiRequest<{ sources: Source[]; faqs: Faq[] }>('/api/knowledge', { method: 'GET' });
    if (result.ok) {
      setSources(result.data.sources ?? []);
      setFaqs(result.data.faqs ?? []);
    }
    router.refresh();
  };

  const upload = async () => {
    if (!files.length) {
      push('Choose at least one file first', 'info');
      return;
    }
    setBusy(true);
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const result = await apiRequest<{ created: { title: string; warning?: string }[] }>('/api/knowledge/upload', { formData });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    const warning = result.data.created.find((item) => item.warning)?.warning;
    push(warning ?? `${result.data.created.length} document(s) indexed for the AI`, warning ? 'info' : 'success');
    setFiles([]);
    await refresh();
  };

  const addText = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/knowledge', { body: { kind: 'text', data: textForm } });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Knowledge added and indexed', 'success');
    setTextForm({ title: '', kind: 'MANUAL', body: '' });
    await refresh();
  };

  const addFaq = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/knowledge', { body: { kind: 'faq', data: faqForm } });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('FAQ published to the AI assistant', 'success');
    setFaqForm({ question: '', answer: '', category: '', published: true });
    await refresh();
  };

  const remove = async (id: string, type: 'source' | 'faq') => {
    if (!confirm('Remove this from the AI knowledge base?')) return;
    const result = await apiRequest('/api/knowledge', { method: 'DELETE', body: { id, type } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Removed', 'success');
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Uploaded documents', value: String(stats.sources) },
          { label: 'Indexed chunks', value: String(stats.chunks) },
          { label: 'Published FAQs', value: String(stats.faqs) },
          { label: 'Storage used', value: `${(stats.bytes / 1024 / 1024).toFixed(2)} / ${limits.storageMb} MB` },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: 'documents', label: 'Documents', count: sources.length },
          { id: 'text', label: 'Paste knowledge' },
          { id: 'faqs', label: 'FAQs', count: faqs.length },
          { id: 'preview', label: 'What the AI knows' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'documents' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title="Upload business documents"
              description="Menu, price list, service catalogue, policies, FAQs or product information. Supported: TXT, MD, CSV, JSON, PDF, DOCX (8 MB each)."
            />
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition hover:bg-[rgb(var(--surface-muted))]">
              <UploadCloud className="h-6 w-6 text-brand-600" aria-hidden />
              <span className="text-sm font-medium">Select files</span>
              <span className="muted text-xs">They are chunked, indexed and searchable immediately</span>
              <input
                type="file"
                multiple
                accept=".txt,.md,.csv,.json,.pdf,.docx,.tsv"
                className="hidden"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
            </label>
            {files.length ? (
              <div className="mt-4 space-y-2">
                <ul className="muted space-y-1 text-sm">
                  {files.map((file) => (
                    <li key={file.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs">{(file.size / 1024).toFixed(0)} KB</span>
                    </li>
                  ))}
                </ul>
                <Button onClick={upload} loading={busy}>
                  Index {files.length} file(s)
                </Button>
              </div>
            ) : null}

            <div className="mt-6">
              <p className="text-sm font-semibold">Indexed documents</p>
              {sources.length === 0 ? (
                <p className="muted mt-2 text-sm">
                  Nothing uploaded yet. Until you upload documents the AI support assistant escalates more questions to
                  your team.
                </p>
              ) : (
                <ul className="mt-3 divide-y">
                  {sources.map((source) => (
                    <li key={source.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{source.title}</p>
                        <p className="muted text-xs">
                          {source.kind} · {source.chunk_count} chunks · {(source.size_bytes / 1024).toFixed(0)} KB ·{' '}
                          {formatDate(source.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={source.status === 'READY' ? 'success' : 'warning'}>{source.status.toLowerCase()}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => remove(source.id, 'source')} aria-label={`Delete ${source.title}`}>
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="How training works" />
            <ul className="muted space-y-3 text-sm">
              <li>
                Documents are split into overlapping chunks and indexed with keyword statistics (BM25) so retrieval is
                fast and relevant.
              </li>
              <li>
                When an owner or customer asks a question, only the most relevant chunks for <em>this</em> business are
                passed to the AI.
              </li>
              <li>Retrieval is tenant-scoped: documents from other businesses are never reachable.</li>
              <li>
                If nothing relevant is found, the assistant says it does not have enough information and hands over to a
                human rather than guessing.
              </li>
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === 'text' ? (
        <Card>
          <CardHeader
            title="Paste knowledge directly"
            description="Useful for policies, service descriptions or information that is not in a document yet."
          />
          <form onSubmit={addText} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Title" required>
                <Input
                  required
                  value={textForm.title}
                  onChange={(event) => setTextForm({ ...textForm, title: event.target.value })}
                  placeholder="Cancellation policy"
                />
              </Field>
              <Field label="Type">
                <select
                  className="input"
                  value={textForm.kind}
                  onChange={(event) => setTextForm({ ...textForm, kind: event.target.value })}
                >
                  {['MANUAL', 'POLICY', 'CATALOG', 'FAQ'].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Content" required hint="At least 20 characters. Write it the way you would explain it to a customer.">
              <Textarea
                required
                value={textForm.body}
                onChange={(event) => setTextForm({ ...textForm, body: event.target.value })}
                className="min-h-[180px]"
              />
            </Field>
            <Button type="submit" loading={busy}>
              <Plus className="h-4 w-4" /> Add to knowledge base
            </Button>
          </form>
        </Card>
      ) : null}

      {tab === 'faqs' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader title="Add an FAQ" description="Published FAQs are answered instantly and counted when used." />
            <form onSubmit={addFaq} className="space-y-4">
              <Field label="Question" required>
                <Input
                  required
                  value={faqForm.question}
                  onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })}
                  placeholder="Do you take walk-ins?"
                />
              </Field>
              <Field label="Answer" required>
                <Textarea
                  required
                  value={faqForm.answer}
                  onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })}
                  placeholder="Yes — walk-ins are welcome before 11:00 and after 15:00, subject to availability."
                />
              </Field>
              <Field label="Category">
                <Input value={faqForm.category} onChange={(event) => setFaqForm({ ...faqForm, category: event.target.value })} />
              </Field>
              <Checkbox
                label="Publish to the AI assistant immediately"
                checked={faqForm.published}
                onChange={(event) => setFaqForm({ ...faqForm, published: event.target.checked })}
              />
              <Button type="submit" loading={busy}>
                Save FAQ
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Published FAQs" description="Sorted by how often the AI used them." />
            {faqs.length === 0 ? (
              <p className="muted text-sm">No FAQs yet.</p>
            ) : (
              <ul className="divide-y">
                {faqs.map((faq) => (
                  <li key={faq.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{faq.question}</p>
                        <p className="muted mt-1 text-sm">{faq.answer}</p>
                        <p className="muted mt-1 text-xs">
                          {faq.published ? 'published' : 'draft'} · asked {faq.asked_count} times
                          {faq.category ? ` · ${faq.category}` : ''}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => remove(faq.id, 'faq')} aria-label={`Delete ${faq.question}`}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'preview' ? (
        <Card>
          <CardHeader
            title="Retrieved context preview"
            description="A live sample of the business information supplied to the AI. Verify it is accurate before customers rely on it."
          />
          {preview ? (
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border p-4 text-xs">{preview}</pre>
          ) : (
            <Alert tone="warning" title="No knowledge yet">
              Upload a document or add an FAQ and this preview will show exactly what the assistant is allowed to answer
              from.
            </Alert>
          )}
          <p className="muted mt-3 flex items-center gap-2 text-xs">
            <FileText className="h-3 w-3" /> Only this business’s documents are ever included.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
