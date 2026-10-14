'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { Badge, Field, Input, apiRequest } from '@/components/ui';
import { cn } from '@/lib/utils';

type Turn = {
  id: string;
  from: 'customer' | 'ai';
  body: string;
  escalated?: boolean;
  sources?: { title: string; kind?: string }[];
};

export function SupportChat({
  slug,
  businessName,
  greeting,
  enabled,
  escalationMessage,
}: {
  slug: string;
  businessName: string;
  greeting: string;
  enabled: boolean;
  escalationMessage: string;
}) {
  const [turns, setTurns] = useState<Turn[]>([{ id: 'greeting', from: 'ai', body: greeting }]);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', phone: '' });
  const [needsContact, setNeedsContact] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, needsContact]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = message.trim();
    if (question.length < 3) return;
    if (needsContact && !contact.email && !contact.phone && !contact.name) {
      setError('Please share a way to reach you so our team can follow up.');
      return;
    }
    setError(null);
    setBusy(true);
    setTurns((current) => [...current, { id: `me-${Date.now()}`, from: 'customer', body: question }]);
    setMessage('');

    const result = await apiRequest<{
      reply: string;
      escalated: boolean;
      conversationId: string;
      sources?: { title: string; kind?: string }[];
    }>(`/api/support/public`, {
      body: {
        businessSlug: slug,
        message: question,
        conversationId: conversationId ?? undefined,
        name: contact.name || undefined,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
      },
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      setTurns((current) => [
        ...current,
        { id: `err-${Date.now()}`, from: 'ai', body: escalationMessage },
      ]);
      setNeedsContact(true);
      return;
    }

    setConversationId(result.data.conversationId);
    setTurns((current) => [
      ...current,
      {
        id: `ai-${Date.now()}`,
        from: 'ai',
        body: result.data.reply,
        escalated: result.data.escalated,
        sources: result.data.sources,
      },
    ]);
    if (result.data.escalated) setNeedsContact(true);
  };

  if (!enabled) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm font-semibold">Chat is currently switched off</p>
        <p className="muted mt-1 text-sm">
          This business has paused the AI assistant. Please call or email them instead.
        </p>
      </div>
    );
  }

  return (
    <div className="card flex h-[620px] flex-col p-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{businessName} assistant</p>
            <p className="muted text-xs">Answers from the business knowledge base</p>
          </div>
        </div>
        <Badge tone="brand">AI</Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.map((turn) => (
          <div key={turn.id} className={cn('flex', turn.from === 'customer' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl border p-3 text-sm',
                turn.from === 'customer' ? 'bg-brand-600 text-white' : 'bg-[rgb(var(--surface-muted))]',
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] opacity-80">
                {turn.from === 'ai' ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                {turn.from === 'ai' ? 'AI assistant' : 'You'}
              </div>
              <p className="whitespace-pre-wrap">{turn.body}</p>
              {turn.sources?.length ? (
                <p className="mt-2 text-[11px] opacity-80">
                  Source: {turn.sources.map((source) => source.title).join(', ')}
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? <p className="muted text-xs">The assistant is checking your business information…</p> : null}
        <div ref={endRef} />
      </div>

      {needsContact ? (
        <div className="space-y-2 border-t bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            A team member will help you personally — how can we reach you?
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              placeholder="Your name"
              value={contact.name}
              onChange={(event) => setContact({ ...contact, name: event.target.value })}
              aria-label="Your name"
            />
            <Input
              placeholder="Email"
              type="email"
              value={contact.email}
              onChange={(event) => setContact({ ...contact, email: event.target.value })}
              aria-label="Email address"
            />
            <Input
              placeholder="Phone / WhatsApp"
              value={contact.phone}
              onChange={(event) => setContact({ ...contact, phone: event.target.value })}
              aria-label="Phone number"
            />
          </div>
          <p className="text-amber-900/80 dark:text-amber-200/80">
            Keeping these details updated means your request is captured even if you send more questions.
          </p>
        </div>
      ) : null}

      {error ? <p className="border-t px-4 py-2 text-xs text-red-600">{error}</p> : null}

      <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
        <Field className="flex-1">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about prices, hours, services or policies…"
            aria-label="Your question"
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-60"
          aria-label="Send question"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <p className="muted border-t px-4 py-2 text-[11px]">
        The assistant never invents prices, stock levels or availability. It will say when it does not have enough
        information and pass you to a human.
      </p>
    </div>
  );
}
