'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CheckCircle2, Megaphone, Send, Sparkles } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, StatusBadge, Tabs, Textarea, apiRequest, useToast } from '@/components/ui';
import { MARKETING_CHANNELS, MARKETING_POST_FLOW } from '@/lib/domain';
import { formatDate } from '@/lib/utils';

type Post = {
  id: string;
  channel: string;
  title: string | null;
  body: string;
  hashtags: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  campaign_id: string | null;
  created_at: string;
};

type Campaign = {
  id: string;
  name: string;
  objective: string | null;
  audience: string | null;
  channels: string[];
  status: string;
  start_date: string | null;
  end_date: string | null;
  post_count: number;
  approved_count: number;
};

export function MarketingWorkspace({
  initialPosts,
  initialCampaigns,
  counts,
  usage,
}: {
  initialPosts: Post[];
  initialCampaigns: Campaign[];
  counts: { status: string; c: number }[];
  usage: { used: number; limit: number };
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState('generate');
  const [posts, setPosts] = useState(initialPosts);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [editBody, setEditBody] = useState('');

  const [generateForm, setGenerateForm] = useState({
    channel: 'FACEBOOK',
    goal: 'Increase repeat bookings this month',
    audience: 'Customers who have visited in the last 90 days',
    offer: '15% off when booked this week',
    tone: 'friendly and confident',
    campaignName: '',
    variants: '2',
  });
  const [calendarForm, setCalendarForm] = useState({
    objective: 'Grow weekend bookings',
    audience: 'Local customers within 10 km',
    durationDays: '14',
    channels: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP'] as string[],
  });

  const refresh = async () => {
    const result = await apiRequest<{ posts: Post[]; campaigns: Campaign[] }>('/api/marketing', { method: 'GET' });
    if (result.ok) {
      setPosts(result.data.posts ?? []);
      setCampaigns(result.data.campaigns ?? []);
    }
    router.refresh();
  };

  const generate = async () => {
    setBusy(true);
    const result = await apiRequest<{ posts: Post[]; provider: string }>('/api/marketing', {
      body: { mode: 'posts', data: { ...generateForm, variants: Number(generateForm.variants) } },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    setProvider(result.data.provider);
    push('Draft content generated — review, edit, then approve', 'success');
    setTab('review');
    await refresh();
  };

  const generateCalendar = async () => {
    setBusy(true);
    const result = await apiRequest('/api/marketing', {
      body: { mode: 'calendar', data: { ...calendarForm, durationDays: Number(calendarForm.durationDays) } },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Content calendar created as drafts', 'success');
    setTab('review');
    await refresh();
  };

  const act = async (post: Post, action: 'approve' | 'schedule' | 'publish' | 'reject') => {
    const result = await apiRequest('/api/marketing', {
      method: 'PATCH',
      body: { id: post.id, action, scheduledAt: action === 'schedule' ? new Date(Date.now() + 86400000).toISOString() : undefined },
    });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(
      action === 'publish'
        ? 'Marked as published'
        : action === 'approve'
          ? 'Approved — ready to schedule or publish'
          : action === 'schedule'
            ? 'Scheduled for tomorrow'
            : 'Returned to draft',
      'success',
    );
    await refresh();
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    const result = await apiRequest('/api/marketing', { method: 'PATCH', body: { id: editing.id, action: 'update', body: editBody } });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Post updated', 'success');
    setEditing(null);
    await refresh();
  };

  const remove = async (post: Post) => {
    const result = await apiRequest('/api/marketing', { method: 'DELETE', body: { id: post.id } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Drafts', value: String(counts.find((count) => count.status === 'DRAFT')?.c ?? 0) },
          { label: 'Approved', value: String(counts.find((count) => count.status === 'APPROVED')?.c ?? 0) },
          { label: 'Scheduled', value: String(counts.find((count) => count.status === 'SCHEDULED')?.c ?? 0) },
          { label: 'Published', value: String(counts.find((count) => count.status === 'PUBLISHED')?.c ?? 0) },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="muted text-xs font-medium uppercase tracking-wide">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: 'generate', label: 'Generate' },
          { id: 'review', label: 'Review & approve', count: posts.length },
          { id: 'campaigns', label: 'Campaigns', count: campaigns.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'generate' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Generate marketing content"
              description="Posts are created as drafts. Nothing is published until you approve it."
              action={<Badge tone="brand">{provider ?? 'AI + templates'}</Badge>}
            />
            <div className="space-y-4">
              <Field label="Channel">
                <Select
                  value={generateForm.channel}
                  onChange={(event) => setGenerateForm({ ...generateForm, channel: event.target.value })}
                >
                  {MARKETING_CHANNELS.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel.charAt(0) + channel.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Goal" required hint="What should this content achieve?">
                <Input value={generateForm.goal} onChange={(event) => setGenerateForm({ ...generateForm, goal: event.target.value })} />
              </Field>
              <Field label="Audience">
                <Input value={generateForm.audience} onChange={(event) => setGenerateForm({ ...generateForm, audience: event.target.value })} />
              </Field>
              <Field label="Offer">
                <Input value={generateForm.offer} onChange={(event) => setGenerateForm({ ...generateForm, offer: event.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tone">
                  <Input value={generateForm.tone} onChange={(event) => setGenerateForm({ ...generateForm, tone: event.target.value })} />
                </Field>
                <Field label="Variants">
                  <Select value={generateForm.variants} onChange={(event) => setGenerateForm({ ...generateForm, variants: event.target.value })}>
                    {['1', '2', '3'].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Campaign name">
                <Input
                  value={generateForm.campaignName}
                  onChange={(event) => setGenerateForm({ ...generateForm, campaignName: event.target.value })}
                  placeholder="Weekend booking push"
                />
              </Field>
              <Button onClick={generate} loading={busy}>
                <Sparkles className="h-4 w-4" /> Generate drafts
              </Button>
              <p className="muted text-xs">
                AI messages used this month: {usage.used} / {usage.limit}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Content calendar"
              description="A multi-day plan with one draft per day across your chosen channels."
            />
            <div className="space-y-4">
              <Field label="Objective" required>
                <Input value={calendarForm.objective} onChange={(event) => setCalendarForm({ ...calendarForm, objective: event.target.value })} />
              </Field>
              <Field label="Audience">
                <Input value={calendarForm.audience} onChange={(event) => setCalendarForm({ ...calendarForm, audience: event.target.value })} />
              </Field>
              <Field label="Duration (days)">
                <Select
                  value={calendarForm.durationDays}
                  onChange={(event) => setCalendarForm({ ...calendarForm, durationDays: event.target.value })}
                >
                  {['7', '14', '21', '30'].map((value) => (
                    <option key={value} value={value}>
                      {value} days
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Channels">
                <div className="flex flex-wrap gap-2">
                  {MARKETING_CHANNELS.map((channel) => {
                    const selected = calendarForm.channels.includes(channel);
                    return (
                      <button
                        key={channel}
                        type="button"
                        onClick={() =>
                          setCalendarForm({
                            ...calendarForm,
                            channels: selected
                              ? calendarForm.channels.filter((item) => item !== channel)
                              : [...calendarForm.channels, channel],
                          })
                        }
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          selected ? 'border-brand-600 bg-brand-600 text-white' : 'muted'
                        }`}
                      >
                        {channel.charAt(0) + channel.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Button onClick={generateCalendar} loading={busy} variant="secondary">
                <CalendarDays className="h-4 w-4" /> Build calendar
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'review' ? (
        <div className="space-y-3">
          <Alert tone="info" title="Approval required">
            Generate → Edit → Approve → Publish. The platform never publishes on your behalf without an explicit
            approval step.
          </Alert>
          {posts.length === 0 ? (
            <Card>
              <p className="muted text-sm">No content yet. Generate your first campaign.</p>
            </Card>
          ) : (
            posts.map((post) => (
              <Card key={post.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{post.channel}</Badge>
                      <StatusBadge status={post.status} />
                      {post.scheduled_at ? <span className="muted text-xs">scheduled {formatDate(post.scheduled_at)}</span> : null}
                    </div>
                    {post.title ? <p className="mt-2 text-sm font-semibold">{post.title}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing(post);
                        setEditBody(post.body);
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => act(post, 'approve')}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => act(post, 'schedule')}>
                      <CalendarDays className="h-3.5 w-3.5" /> Schedule
                    </Button>
                    <Button size="sm" onClick={() => act(post, 'publish')}>
                      <Send className="h-3.5 w-3.5" /> Publish
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(post)}>
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>
                <p className="muted mt-2 text-xs">Status flow: {MARKETING_POST_FLOW.join(' → ')}</p>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {tab === 'campaigns' ? (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <Card>
              <p className="muted text-sm">No campaigns yet.</p>
            </Card>
          ) : (
            campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{campaign.name}</p>
                    <p className="muted mt-1 text-sm">{campaign.objective}</p>
                    <p className="muted mt-1 text-xs">
                      {campaign.channels.join(', ') || 'no channels'} · {campaign.post_count} posts ·{' '}
                      {campaign.approved_count} approved
                      {campaign.start_date ? ` · started ${formatDate(campaign.start_date)}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={campaign.status} />
                </div>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader
            title={`Edit ${editing.channel} post`}
            description="Edits are saved to the draft — approval is still required before publishing."
            action={<Megaphone className="h-4 w-4 text-brand-600" />}
          />
          <Textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} className="min-h-[200px]" />
          <div className="mt-3 flex gap-2">
            <Button onClick={saveEdit} loading={busy}>
              Save changes
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
