'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, CornerDownLeft, FileText, Sparkles, TriangleAlert, User } from 'lucide-react';
import { Badge, Button, Card, apiRequest, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

type Section = { kind: string; label: string; items: string[] };
type Answer = {
  intent: string;
  answer: string;
  sections: Section[];
  sources: { title: string; snippet: string; kind: string }[];
  provider: string;
  model: string | null;
  latencyMs: number;
  tokens: { in: number; out: number };
  suggestions: string[];
  usage?: { used: number; limit: number };
};

type Turn = { role: 'user' | 'ai'; text: string; answer?: Answer };

export function AssistantChat({
  businessName,
  examples,
  initialUsage,
  provider,
}: {
  businessName: string;
  examples: string[];
  initialUsage: { used: number; limit: number };
  provider: string;
}) {
  const { push } = useToast();
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(initialUsage);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, loading]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setTurns((current) => [...current, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    const result = await apiRequest<Answer>('/api/ai/assistant', { body: { message: trimmed } });
    setLoading(false);
    if (!result.ok) {
      push(result.error, 'danger');
      setTurns((current) => [
        ...current,
        {
          role: 'ai',
          text:
            result.code === 'plan_limit'
              ? result.error
              : 'I could not complete that request. Please try again, or ask a simpler question about your customers, sales, stock or appointments.',
        },
      ]);
      return;
    }
    setTurns((current) => [...current, { role: 'ai', text: result.data.answer, answer: result.data }]);
    if (result.data.usage) setUsage(result.data.usage);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="flex min-h-[560px] flex-col p-0">
        <div className="flex items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{businessName} AI assistant</p>
              <p className="muted text-xs">{provider}</p>
            </div>
          </div>
          <Badge tone="info">
            {usage.used} / {usage.limit} messages
          </Badge>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {turns.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-5">
              <p className="text-sm font-semibold">Ask about your own business data</p>
              <p className="muted mt-1 text-sm">
                I answer from your stored records, your uploaded documents and — clearly labelled — my own
                recommendations. I never invent prices, stock levels or revenue numbers.
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {examples.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => ask(example)}
                      className="w-full rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-[rgb(var(--surface-muted))]"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {turns.map((turn, index) => (
            <div key={index} className={cn('flex gap-3', turn.role === 'user' && 'justify-end')}>
              {turn.role === 'ai' ? (
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
                  <Bot className="h-3.5 w-3.5" />
                </span>
              ) : null}
              <div className={cn('max-w-[85%] space-y-3', turn.role === 'user' && 'order-first')}>
                <div
                  className={cn(
                    'whitespace-pre-wrap rounded-2xl border p-3 text-sm leading-relaxed',
                    turn.role === 'user' ? 'bg-brand-600 text-white' : 'bg-[rgb(var(--surface-raised))]',
                  )}
                >
                  {turn.text}
                </div>

                {turn.answer ? (
                  <div className="space-y-2">
                    {turn.answer.sections.map((section) => (
                      <details key={section.kind} className="rounded-xl border p-3" open={section.kind === 'VERIFIED_DATA'}>
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">
                          {section.kind === 'AI_RECOMMENDATION' ? (
                            <Sparkles className="mr-1 inline h-3 w-3 text-brand-600" />
                          ) : (
                            <FileText className="mr-1 inline h-3 w-3" />
                          )}
                          {section.label}
                        </summary>
                        <ul className="muted mt-2 space-y-1 text-xs">
                          {section.items.map((item, itemIndex) => (
                            <li key={itemIndex}>• {item}</li>
                          ))}
                        </ul>
                      </details>
                    ))}
                    {turn.answer.sources.length ? (
                      <details className="rounded-xl border p-3">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide">
                          Document sources ({turn.answer.sources.length})
                        </summary>
                        <ul className="muted mt-2 space-y-2 text-xs">
                          {turn.answer.sources.map((source, sourceIndex) => (
                            <li key={sourceIndex}>
                              <p className="font-medium">{source.title}</p>
                              <p>{source.snippet}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <p className="muted text-[11px]">
                      {turn.answer.provider}
                      {turn.answer.model ? ` · ${turn.answer.model}` : ''} · {turn.answer.latencyMs}ms
                      {turn.answer.tokens.in || turn.answer.tokens.out
                        ? ` · ${turn.answer.tokens.in + turn.answer.tokens.out} tokens`
                        : ''}
                    </p>
                    {turn.answer.suggestions.length && index === turns.length - 1 ? (
                      <div className="flex flex-wrap gap-2">
                        {turn.answer.suggestions.slice(0, 3).map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => ask(suggestion)}
                            className="rounded-full border px-3 py-1 text-xs transition hover:bg-[rgb(var(--surface-muted))]"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {turn.role === 'user' ? (
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-900 text-white dark:bg-ink-700">
                  <User className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>
          ))}

          {loading ? (
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <div className="flex gap-1">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-2 w-2 animate-bounce rounded-full bg-brand-600/60"
                    style={{ animationDelay: `${dot * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(input);
          }}
          className="border-t p-4"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  ask(input);
                }
              }}
              rows={2}
              placeholder="Ask about customers, sales, stock, appointments or ask for a report…"
              className="input min-h-[52px] resize-none"
              aria-label="Message the AI business assistant"
            />
            <Button type="submit" loading={loading} aria-label="Send message">
              <CornerDownLeft className="h-4 w-4" />
            </Button>
          </div>
          <p className="muted mt-2 text-xs">
            Answers are labelled as verified business data, uploaded document content or AI recommendation.
          </p>
        </form>
      </Card>

      <div className="space-y-4">
        <Card>
          <p className="text-sm font-semibold">How grounding works</p>
          <ul className="muted mt-3 space-y-3 text-sm">
            <li>
              <span className="font-medium text-[rgb(var(--text))]">Verified business data</span> — calculated live from
              your customers, orders, appointments, stock and conversations.
            </li>
            <li>
              <span className="font-medium text-[rgb(var(--text))]">Uploaded business document</span> — retrieved from
              the documents you trained the assistant with.
            </li>
            <li>
              <span className="font-medium text-[rgb(var(--text))]">AI recommendation</span> — advice and suggestions,
              never presented as a stored fact.
            </li>
            <li>
              <span className="font-medium text-[rgb(var(--text))]">Not enough information</span> — the assistant says
              so and asks for human assistance instead of guessing.
            </li>
          </ul>
        </Card>

        <Card>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4 text-amber-600" /> Guardrails
          </p>
          <p className="muted mt-2 text-sm">
            “Never invent prices, inventory levels, appointment availability, policies, revenue figures or customer
            information. If required information is unavailable, clearly state that you do not have enough information
            and request human assistance.”
          </p>
        </Card>
      </div>
    </div>
  );
}
