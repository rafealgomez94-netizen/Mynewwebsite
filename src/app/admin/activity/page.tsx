import { listContactMessages, platformSupportTickets } from '@/lib/db/repositories/platform';
import { listPlatformAuditLogs } from '@/lib/db/repositories/accounts';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Badge, Card, CardHeader, StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminActivityPage() {
  const audits = listPlatformAuditLogs(200);
  const tickets = platformSupportTickets(100);
  const contactMessages = listContactMessages(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Platform activity</h1>
        <p className="muted mt-1 text-sm">
          Support escalations, inbound demo requests and the privileged-action audit trail.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Support tickets</h2>
            <p className="muted text-xs">{tickets.length} requests across all tenants.</p>
          </div>
          {tickets.length === 0 ? (
            <p className="muted p-5 text-sm">Nothing here yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{ticket.subject}</p>
                    <StatusBadge status={ticket.status} />
                    <Badge tone={ticket.priority === 'HIGH' || ticket.priority === 'URGENT' ? 'danger' : 'neutral'}>
                      {ticket.priority}
                    </Badge>
                    {ticket.escalated_from_ai ? <Badge tone="brand">AI escalation</Badge> : null}
                  </div>
                  {ticket.description ? <p className="muted mt-1 text-sm">{ticket.description}</p> : null}
                  <p className="muted mt-1 text-xs">
                    {ticket.business_name ? `${ticket.business_name} · ` : ''}
                    {[ticket.contact_name, ticket.contact_email, ticket.contact_phone].filter(Boolean).join(' · ') ||
                      'no contact detail'}
                    {' · '}
                    {formatDateTime(ticket.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-0">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Demo & contact requests</h2>
              <p className="muted text-xs">From the marketing site contact form.</p>
            </div>
            {contactMessages.length === 0 ? (
              <p className="muted p-5 text-sm">No inbound requests yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {contactMessages.map((message) => (
                  <li key={message.id} className="px-5 py-3">
                    <p className="font-medium">
                      {message.name}
                      {message.company ? ` · ${message.company}` : ''}{' '}
                      <span className="muted text-xs">({message.topic})</span>
                    </p>
                    <p className="muted mt-1 text-xs">
                      {message.email}
                      {message.phone ? ` · ${message.phone}` : ''} · {formatDateTime(message.created_at)}
                    </p>
                    <p className="mt-1 text-sm">{message.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-0">
            <CardHeader title="Audit trail" description="Every privileged action with actor and entity." />
            <ul className="divide-y text-sm">
              {audits.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="font-medium">{entry.action}</p>
                    <p className="muted text-xs">
                      {entry.actor_email ?? 'system'}
                      {entry.entity_type ? ` · ${entry.entity_type}` : ''}
                      {entry.entity_id ? ` · ${entry.entity_id.slice(-6)}` : ''}
                    </p>
                  </div>
                  <span className="muted text-xs">{formatDate(entry.created_at)}</span>
                </li>
              ))}
              {audits.length === 0 ? <li className="muted px-5 py-4">No audit entries yet.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
