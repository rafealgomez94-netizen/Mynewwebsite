'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Clock, KeyRound, Save, ShieldCheck, UserCog } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, StatusBadge, Tabs, Textarea, apiRequest, useToast } from '@/components/ui';
import { BUSINESS_TYPES, CHANNELS } from '@/lib/domain';
import { passwordIssues } from '@/lib/validation';
import { SUPPORT } from '@/lib/domain';

type Hour = { day: string; open: string; close: string; closed: boolean };

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export function SettingsWorkspace({
  user,
  business,
  businesses,
  comms,
  support,
  hours,
  canManage,
}: {
  user: { name: string; email: string; phone: string | null; jobTitle: string | null; timezone: string; avatarUrl: string | null };
  hours: Hour[];
  business: {
    id: string;
    name: string;
    type: string;
    description: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    currency: string;
    timezone: string;
    slug: string;
  };
  businesses: { id: string; name: string; slug: string }[];
  comms: Record<string, boolean>;
  support: {
    greeting: string | null;
    tone: string | null;
    escalation_message: string | null;
    handoff_email: string | null;
    auto_reply_enabled: number;
    widget_enabled: number;
  };
  canManage: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState('profile');
  const [busy, setBusy] = useState(false);

  const [profileForm, setProfileForm] = useState({
    name: user.name,
    phone: user.phone ?? '',
    jobTitle: user.jobTitle ?? '',
    timezone: user.timezone,
    avatarUrl: user.avatarUrl ?? '',
  });
  const [businessForm, setBusinessForm] = useState({
    name: business.name,
    type: business.type,
    description: business.description ?? '',
    address: business.address ?? '',
    city: business.city ?? '',
    country: business.country ?? '',
    phone: business.phone ?? '',
    email: business.email ?? '',
    website: business.website ?? '',
    currency: business.currency,
    timezone: business.timezone,
  });
  const [commsForm, setCommsForm] = useState<Record<string, boolean>>(comms);
  const [supportForm, setSupportForm] = useState({
    greeting: support.greeting ?? '',
    tone: support.tone ?? '',
    escalationMessage: support.escalation_message ?? '',
    handoffEmail: support.handoff_email ?? '',
    autoReplyEnabled: support.auto_reply_enabled === 1,
    widgetEnabled: support.widget_enabled === 1,
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const issues = passwordIssues(passwordForm.newPassword);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/account/profile', { method: 'PATCH', body: profileForm });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Profile updated', 'success');
    router.refresh();
  };

  const saveBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/business/profile', { method: 'PATCH', body: businessForm });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Business details updated', 'success');
    router.refresh();
  };

  const saveComms = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/business/profile', { method: 'PATCH', body: { comms: commsForm } });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Communication preferences saved — AI follow-ups respect these choices', 'success');
    router.refresh();
  };

  const saveSupport = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/support/settings', { method: 'PATCH', body: supportForm });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Support configuration saved', 'success');
    router.refresh();
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) {
      push('The two new passwords do not match', 'danger');
      return;
    }
    if (issues.length) {
      push('Please choose a stronger password', 'danger');
      return;
    }
    setBusy(true);
    const result = await apiRequest('/api/account/password', {
      body: { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Password changed — all other sessions were signed out', 'success');
    setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
  };

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'profile', label: 'My profile' },
          { id: 'business', label: 'Business details' },
          { id: 'hours', label: 'Opening hours' },
          { id: 'comms', label: 'Communication' },
          { id: 'security', label: 'Security' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'profile' ? (
        <Card>
          <CardHeader
            title="Your profile"
            description="This is the identity shown to your team in tasks, audit entries and AI activity."
            action={<UserCog className="h-4 w-4 text-brand-600" />}
          />
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input required value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={user.email} readOnly className="muted" />
            </Field>
            <Field label="Phone">
              <Input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} />
            </Field>
            <Field label="Job title">
              <Input value={profileForm.jobTitle} onChange={(event) => setProfileForm({ ...profileForm, jobTitle: event.target.value })} />
            </Field>
            <Field label="Timezone">
              <Input value={profileForm.timezone} onChange={(event) => setProfileForm({ ...profileForm, timezone: event.target.value })} placeholder="Africa/Monrovia" />
            </Field>
            <Field label="Avatar URL">
              <Input value={profileForm.avatarUrl} onChange={(event) => setProfileForm({ ...profileForm, avatarUrl: event.target.value })} placeholder="https://…" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy}>
                <Save className="h-4 w-4" /> Save profile
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t pt-4">
            <p className="text-sm font-semibold">Your workspaces</p>
            <ul className="muted mt-2 space-y-1 text-sm">
              {businesses.map((workspace) => (
                <li key={workspace.id}>
                  {workspace.name} {workspace.id === business.id ? '(current)' : ''} · /{workspace.slug}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {tab === 'business' ? (
        <Card>
          <CardHeader
            title="Business details"
            description="Used across invoices, the public booking page and AI answers. Keep it accurate — the assistant treats this as verified data."
            action={<Building2 className="h-4 w-4 text-brand-600" />}
          />
          <form onSubmit={saveBusiness} className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" required className="sm:col-span-2">
              <Input required value={businessForm.name} onChange={(event) => setBusinessForm({ ...businessForm, name: event.target.value })} />
            </Field>
            <Field label="Business type" required>
              <Select value={businessForm.type} onChange={(event) => setBusinessForm({ ...businessForm, type: event.target.value })}>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency">
              <Input value={businessForm.currency} onChange={(event) => setBusinessForm({ ...businessForm, currency: event.target.value.toUpperCase() })} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea value={businessForm.description} onChange={(event) => setBusinessForm({ ...businessForm, description: event.target.value })} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={businessForm.address} onChange={(event) => setBusinessForm({ ...businessForm, address: event.target.value })} />
            </Field>
            <Field label="City">
              <Input value={businessForm.city} onChange={(event) => setBusinessForm({ ...businessForm, city: event.target.value })} />
            </Field>
            <Field label="Country">
              <Input value={businessForm.country} onChange={(event) => setBusinessForm({ ...businessForm, country: event.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={businessForm.phone} onChange={(event) => setBusinessForm({ ...businessForm, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={businessForm.email} onChange={(event) => setBusinessForm({ ...businessForm, email: event.target.value })} />
            </Field>
            <Field label="Website">
              <Input value={businessForm.website} onChange={(event) => setBusinessForm({ ...businessForm, website: event.target.value })} />
            </Field>
            <Field label="Timezone">
              <Input value={businessForm.timezone} onChange={(event) => setBusinessForm({ ...businessForm, timezone: event.target.value })} />
            </Field>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Button type="submit" loading={busy} disabled={!canManage}>
                <Save className="h-4 w-4" /> Save business details
              </Button>
              {canManage ? null : <Badge tone="neutral">Your role has read-only access to these settings</Badge>}
            </div>
          </form>
          <div className="mt-6 border-t pt-4 text-sm">
            <p className="font-semibold">Public pages</p>
            <p className="muted mt-1 text-xs">
              Booking page: <code>/book/{business.slug}</code> · support widget: <code>/support/{business.slug}</code>
            </p>
          </div>
        </Card>
      ) : null}

      {tab === 'hours' ? (
        <OpeningHoursCard
          initial={hours}
          canManage={canManage}
          onSaved={() => router.refresh()}
          onError={(message) => push(message, 'danger')}
        />
      ) : null}

      {tab === 'comms' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Customer communication preferences"
              description="Which channels you allow for customer contact. The AI refuses to draft messages on channels you switch off."
            />
            <form onSubmit={saveComms} className="space-y-3">
              {CHANNELS.map((channel) => (
                <label key={channel} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                  <span>{channel.charAt(0) + channel.slice(1).toLowerCase()}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(commsForm[channel])}
                    onChange={(event) => setCommsForm({ ...commsForm, [channel]: event.target.checked })}
                  />
                </label>
              ))}
              <Button type="submit" loading={busy} disabled={!canManage}>
                <Save className="h-4 w-4" /> Save preferences
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="AI support configuration"
              description="Greeting, tone and the exact wording used when handing over to a human."
            />
            <form onSubmit={saveSupport} className="space-y-4">
              <Field label="Greeting">
                <Textarea value={supportForm.greeting} onChange={(event) => setSupportForm({ ...supportForm, greeting: event.target.value })} />
              </Field>
              <Field label="Tone">
                <Input value={supportForm.tone} onChange={(event) => setSupportForm({ ...supportForm, tone: event.target.value })} />
              </Field>
              <Field label="Human handover message">
                <Textarea
                  value={supportForm.escalationMessage}
                  onChange={(event) => setSupportForm({ ...supportForm, escalationMessage: event.target.value })}
                />
              </Field>
              <Field label="Escalation email">
                <Input
                  type="email"
                  value={supportForm.handoffEmail}
                  onChange={(event) => setSupportForm({ ...supportForm, handoffEmail: event.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={supportForm.autoReplyEnabled}
                  onChange={(event) => setSupportForm({ ...supportForm, autoReplyEnabled: event.target.checked })}
                />
                Enable AI auto-replies
              </label>
              <Button type="submit" loading={busy} disabled={!canManage}>
                Save support settings
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Change password" description="Changing your password signs out every other session." action={<KeyRound className="h-4 w-4 text-brand-600" />} />
            <form onSubmit={changePassword} className="space-y-4">
              <Field label="Current password" required>
                <Input
                  required
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                />
              </Field>
              <Field
                label="New password"
                required
                hint="At least 10 characters with upper case, lower case and a number."
                error={passwordForm.newPassword && issues.length ? issues[0] : undefined}
              >
                <Input
                  required
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                />
              </Field>
              <Field label="Confirm new password" required>
                <Input
                  required
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(event) => setPasswordForm({ ...passwordForm, confirm: event.target.value })}
                />
              </Field>
              <Button type="submit" loading={busy}>
                Update password
              </Button>
            </form>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Security posture" description="What protects this workspace by default." action={<ShieldCheck className="h-4 w-4 text-emerald-600" />} />
              <ul className="muted space-y-2 text-sm">
                <li>Passwords hashed with bcrypt (12 rounds) — never stored in plain text.</li>
                <li>Session cookies are HttpOnly, SameSite=Lax and hashed at rest.</li>
                <li>Every query is scoped to your business id — cross-tenant access is impossible.</li>
                <li>Rate limits protect login, signup, password reset and public endpoints.</li>
                <li>AI keys live on the server only; the browser never sees them.</li>
                <li>Audit log records privileged actions with actor and timestamp.</li>
              </ul>
            </Card>
            <Card>
              <CardHeader title="Support" description="Reach a human when you need one." />
              <ul className="muted space-y-1 text-sm">
                <li>WhatsApp: {SUPPORT.whatsappDisplay}</li>
                <li>Phone: {SUPPORT.phoneDisplay}</li>
                <li>Email: {SUPPORT.email}</li>
              </ul>
              <Alert tone="info" title="Role and status">
                <p className="text-xs">
                  Signed in as {user.email}. Permissions are enforced on both the API and the UI. <StatusBadge status={business.type} />
                </p>
              </Alert>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OpeningHoursCard({
  initial,
  canManage,
  onSaved,
  onError,
}: {
  initial: Hour[];
  canManage: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [hours, setHours] = useState<Hour[]>(() => {
    if (initial.length) return initial;
    return DAYS.map((day) => ({
      day,
      open: day === 'sunday' ? '10:00' : '09:00',
      close: day === 'sunday' ? '14:00' : '18:00',
      closed: day === 'sunday',
    }));
  });
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/business/profile', { method: 'PATCH', body: { hours } });
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <Card>
      <CardHeader
        title="Opening hours"
        description="Used for appointment availability, the public booking page and AI answers about when you are open."
        action={<Clock className="h-4 w-4 text-brand-600" />}
      />
      <form onSubmit={save} className="space-y-2">
        {hours.map((entry, index) => (
          <div key={entry.day} className="grid items-end gap-2 rounded-xl border p-3 sm:grid-cols-[140px_120px_120px_auto]">
            <span className="text-sm font-medium capitalize">{entry.day}</span>
            <Input
              type="time"
              value={entry.open}
              disabled={entry.closed}
              aria-label={`${entry.day} opening time`}
              onChange={(event) => {
                const copy = [...hours];
                copy[index] = { ...entry, open: event.target.value };
                setHours(copy);
              }}
            />
            <Input
              type="time"
              value={entry.close}
              disabled={entry.closed}
              aria-label={`${entry.day} closing time`}
              onChange={(event) => {
                const copy = [...hours];
                copy[index] = { ...entry, close: event.target.value };
                setHours(copy);
              }}
            />
            <label className="flex items-center gap-2 pb-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={entry.closed}
                onChange={(event) => {
                  const copy = [...hours];
                  copy[index] = { ...entry, closed: event.target.checked };
                  setHours(copy);
                }}
              />
              Closed
            </label>
          </div>
        ))}
        <Button type="submit" loading={busy} disabled={!canManage}>
          <Save className="h-4 w-4" /> Save opening hours
        </Button>
      </form>
    </Card>
  );
}
