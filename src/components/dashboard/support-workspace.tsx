'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Headphones, Send, Settings2, Sparkles, Ticket } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, StatusBadge, Tabs, Textarea, apiRequest, useToast } from '@/components/ui';
import { channelLabel } from '@/lib/domain';
import { relativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Conversation = {
  id: string;
  channel: string;
  status: string;
  contact_name: string | null;
  customer_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  preview: string | null;
  last_message_at: string;
  needs_human: number;
  unread_for_business: number;
  message_count: number;
};

type Message = {
  id: string;
  sender: string;
  body: string;
  grounded: number | null;
  created_at: string;
  sender_name: string | null;
};

type TicketItem = {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  escalated_from_ai: number;
  escalation_reason: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
};

export function SupportWorkspace({
  initialConversations,
  initialTickets,
  settings,
  widgetUrl,
  knowledgeStats,
  provider,
}: {
  initialConversations: Conversation[];
  initialTickets: TicketItem[];
  settings: {
    greeting: string | null;
    tone: string | null;
    escalation_message: string | null;
    handoff_email: string | null;
    auto_reply_enabled: number;
    widget_enabled: number;
  };
  widgetUrl: string;
  knowledgeStats: { sources: number; chunks: number; faqs: number };
  provider: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState('inbox');
  const [conversations, setConversations] = useState(initialConversations);
  const [tickets, setTickets] = useState(initialTickets);
  const [activeId, setActiveId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [form, setForm] = useState({
    greeting: settings.greeting ?? '',
    tone: settings.tone ?? '',
    escalationMessage: settings.escalation_message ?? '',
    handoffEmail: settings.handoff_email ?? '',
    autoReplyEnabled: settings.auto_reply_enabled === 1,
    widgetEnabled: settings.widget_enabled === 1,
  });

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;

  const loadThread = async (conversationId: string) => {
    const result = await apiRequest<{ messages: Message[] }>(`/api/conversations/${conversationId}/messages`, {
      method: 'GET',
    });
    if (result.ok) setMessages(result.data.messages ?? []);
  };

  useEffect(() => {
    if (activeId) loadThread(activeId);
  }, [activeId]);

  const refreshList = async () => {
    const result = await apiRequest<{ conversations: Conversation[] }>('/api/conversations', { method: 'GET' });
    if (result.ok) setConversations(result.data.conversations ?? []);
    router.refresh();
  };

  const sendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeId || !reply.trim()) return;
    setBusy(true);
    const result = await apiRequest(`/api/conversations/${activeId}/messages`, { body: { body: reply } });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    setReply('');
    await loadThread(activeId);
    await refreshList();
  };

  const requestDraft = async () => {
    if (!activeId || !reply.trim()) {
      push('Type the customer question first, then ask the AI to draft an answer', 'info');
      return;
    }
    setBusy(true);
    const result = await apiRequest<{ draft: { reply: string; escalated: boolean; sources: { title: string }[] } }>(
      `/api/conversations/${activeId}/messages`,
      { body: { mode: 'ai_draft', question: reply } },
    );
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    setDraft(result.data.draft.reply);
    if (result.data.draft.escalated) push('AI is not confident — it recommends human help', 'info');
  };

  const updateConversation = async (id: string, status: string) => {
    const result = await apiRequest('/api/conversations', { method: 'PATCH', body: { id, status, markRead: true } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    await refreshList();
  };

  const updateTicket = async (id: string, status: string) => {
    const result = await apiRequest('/api/support/tickets', { method: 'PATCH', body: { id, status } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Ticket updated', 'success');
    const refreshed = await apiRequest<{ tickets: TicketItem[] }>('/api/support/tickets', { method: 'GET' });
    if (refreshed.ok) setTickets(refreshed.data.tickets ?? []);
    router.refresh();
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/support/settings', { method: 'PATCH', body: form });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Support settings saved', 'success');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'inbox', label: 'Inbox', count: conversations.length },
          { id: 'tickets', label: 'Escalations', count: tickets.filter((ticket) => ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED').length },
          { id: 'settings', label: 'AI support settings' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'inbox' ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="p-0">
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">Conversations</p>
              <p className="muted text-xs">{provider} handling customer questions</p>
            </div>
            <ul className="max-h-[560px] divide-y overflow-y-auto">
              {conversations.length === 0 ? (
                <li className="muted p-4 text-sm">
                  No conversations yet. Share your widget link so customers can ask questions: <code>{widgetUrl}</code>
                </li>
              ) : (
                conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      onClick={() => {
                        setActiveId(conversation.id);
                        updateConversation(conversation.id, conversation.status);
                      }}
                      className={cn(
                        'w-full px-4 py-3 text-left transition hover:bg-[rgb(var(--surface-muted))]',
                        activeId === conversation.id && 'bg-[rgb(var(--surface-muted))]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('truncate text-sm', conversation.unread_for_business ? 'font-semibold' : '')}>
                          {conversation.contact_name ?? conversation.customer_name ?? 'Website visitor'}
                        </p>
                        {(conversation.needs_human === 1 || conversation.status === 'ESCALATED') ? (
                          <Badge tone="danger">human</Badge>
                        ) : (
                          <StatusBadge status={conversation.status} />
                        )}
                      </div>
                      <p className="muted mt-1 line-clamp-2 text-xs">{conversation.preview ?? 'No messages'}</p>
                      <p className="muted mt-1 text-[11px]">
                        {channelLabel(conversation.channel)} · {conversation.message_count} messages · {relativeTime(conversation.last_message_at)}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card className="flex min-h-[560px] flex-col p-0">
            {active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {active.contact_name ?? active.customer_name ?? 'Website visitor'}
                    </p>
                    <p className="muted text-xs">
                      {channelLabel(active.channel)} · {active.contact_email ?? active.contact_phone ?? 'no contact detail'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => updateConversation(active.id, 'PENDING')}>
                      Mark pending
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => updateConversation(active.id, 'CLOSED')}>
                      Close
                    </Button>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn('flex', message.sender === 'CUSTOMER' ? 'justify-start' : 'justify-end')}
                    >
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl border p-3 text-sm',
                          message.sender === 'CUSTOMER'
                            ? 'bg-[rgb(var(--surface-muted))]'
                            : message.sender === 'AI'
                              ? 'border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/40'
                              : 'bg-brand-600 text-white',
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] opacity-80">
                          {message.sender === 'AI' ? <Bot className="h-3 w-3" /> : null}
                          {message.sender === 'AI' ? 'AI assistant' : message.sender === 'STAFF' ? message.sender_name ?? 'Staff' : 'Customer'}
                          {message.grounded === 1 ? ' · grounded in your knowledge base' : message.grounded === 0 ? ' · human handoff suggested' : ''}
                        </div>
                        <p className="whitespace-pre-wrap">{message.body}</p>
                        <p className="mt-1 text-[10px] opacity-70">{relativeTime(message.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {draft ? (
                  <div className="border-t border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-900 dark:bg-brand-950/40">
                    <p className="font-semibold">AI draft (not sent)</p>
                    <p className="mt-1 whitespace-pre-wrap">{draft}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setReply(draft)}>
                        Use this draft
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                        Discard
                      </Button>
                    </div>
                  </div>
                ) : null}

                <form onSubmit={sendReply} className="border-t p-4">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Type a reply, or paste the customer question and ask the AI to draft one…"
                      className="min-h-[64px]"
                    />
                    <div className="flex flex-col gap-2">
                      <Button type="button" variant="secondary" onClick={requestDraft} loading={busy} title="Ask the AI to draft a reply">
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button type="submit" loading={busy} title="Send reply">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <div>
                  <Headphones className="mx-auto h-8 w-8 text-brand-600" />
                  <p className="mt-3 text-sm font-semibold">Select a conversation</p>
                  <p className="muted mt-1 text-sm">
                    The AI assistant answers from your knowledge base and escalates to you when it is not confident.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'tickets' ? (
        <Card className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Escalated requests</h2>
            <p className="muted text-xs">
              Created automatically when the AI could not answer confidently. Customer contact details are captured before escalation.
            </p>
          </div>
          {tickets.length === 0 ? (
            <p className="muted p-5 text-sm">No escalations yet.</p>
          ) : (
            <ul className="divide-y">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{ticket.subject}</p>
                      <StatusBadge status={ticket.status} />
                      <Badge tone={ticket.priority === 'URGENT' ? 'danger' : 'neutral'}>{ticket.priority}</Badge>
                      {ticket.escalated_from_ai === 1 ? <Badge tone="brand">AI escalation</Badge> : null}
                    </div>
                    <p className="muted mt-1 text-sm">{ticket.description}</p>
                    {ticket.escalation_reason ? (
                      <p className="muted mt-1 text-xs">Reason: {ticket.escalation_reason}</p>
                    ) : null}
                    <p className="muted mt-1 text-xs">
                      {ticket.contact_name ?? 'Unknown'} · {ticket.contact_email ?? ticket.contact_phone ?? 'no contact detail'} ·{' '}
                      {relativeTime(ticket.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => updateTicket(ticket.id, 'IN_PROGRESS')}>
                      <Ticket className="h-3.5 w-3.5" /> Working on it
                    </Button>
                    <Button size="sm" onClick={() => updateTicket(ticket.id, 'RESOLVED')}>
                      Resolve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'settings' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader
              title="AI customer support configuration"
              description="The assistant answers only from your knowledge base. When it is not confident it hands over to a human."
              action={<Badge tone="brand">{provider}</Badge>}
            />
            <form onSubmit={saveSettings} className="space-y-4">
              <Field label="Greeting message" hint="First message customers see in the widget.">
                <Textarea value={form.greeting} onChange={(event) => setForm({ ...form, greeting: event.target.value })} />
              </Field>
              <Field label="Tone">
                <Input value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} placeholder="friendly-professional" />
              </Field>
              <Field label="Message shown when handing over to a human">
                <Textarea
                  value={form.escalationMessage}
                  onChange={(event) => setForm({ ...form, escalationMessage: event.target.value })}
                />
              </Field>
              <Field label="Escalation email" hint="Where human-handoff requests are sent.">
                <Input
                  type="email"
                  value={form.handoffEmail}
                  onChange={(event) => setForm({ ...form, handoffEmail: event.target.value })}
                  placeholder="rafealgomez94@gmail.com"
                />
              </Field>
              <div className="space-y-2">
                <Checkbox
                  label="Enable AI auto-replies"
                  checked={form.autoReplyEnabled}
                  onChange={(event) => setForm({ ...form, autoReplyEnabled: event.target.checked })}
                />
                <Checkbox
                  label="Widget visible on my website"
                  checked={form.widgetEnabled}
                  onChange={(event) => setForm({ ...form, widgetEnabled: event.target.checked })}
                />
              </div>
              <Button type="submit" loading={busy}>
                <Settings2 className="h-4 w-4" /> Save support settings
              </Button>
            </form>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Customer widget" description="Share this link or embed it on your website." />
              <code className="block break-all rounded-xl border p-3 text-xs">{widgetUrl}</code>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}${widgetUrl}`);
                    push('Widget link copied', 'success');
                  }}
                >
                  Copy link
                </Button>
                <a href={widgetUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="ghost">
                    Open widget
                  </Button>
                </a>
              </div>
            </Card>
            <Card>
              <CardHeader title="Knowledge base" description="What the AI is allowed to answer from." />
              <ul className="muted space-y-1 text-sm">
                <li>{knowledgeStats.sources} uploaded document(s)</li>
                <li>{knowledgeStats.chunks} indexed chunks</li>
                <li>{knowledgeStats.faqs} FAQ entries</li>
              </ul>
              <a href="/dashboard/knowledge" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline">
                Manage knowledge base →
              </a>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
