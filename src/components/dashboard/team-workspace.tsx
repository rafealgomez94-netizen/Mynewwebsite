'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Shield, UserPlus, Users } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, StatusBadge, Tabs, apiRequest, useToast } from '@/components/ui';
import { BUSINESS_ROLES, ROLE_PERMISSIONS, roleLabel } from '@/lib/domain';
import { formatDate } from '@/lib/utils';

type Member = {
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  title: string | null;
  joined_at: string;
  last_login_at: string | null;
};

type StaffRow = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  specialties: string[] | null;
  active: number;
  appointment_count?: number;
};

type AuditRow = {
  id: string;
  action: string;
  actor_email: string | null;
  entity_type: string | null;
  created_at: string;
};

export function TeamWorkspace({
  initialMembers,
  initialStaff,
  auditLogs,
  limits,
  canManage,
  currentUserId,
  staffLoad,
}: {
  initialMembers: Member[];
  initialStaff: StaffRow[];
  auditLogs: AuditRow[];
  limits: { users: number; used: number; plan: string };
  canManage: boolean;
  currentUserId: string;
  staffLoad: { id: string; appointments: number }[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [tab, setTab] = useState('members');
  const [members, setMembers] = useState(initialMembers);
  const [staff, setStaff] = useState(initialStaff);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'STAFF', title: '' });
  const [staffForm, setStaffForm] = useState({ name: '', title: '', email: '', phone: '', specialties: '' });

  const refresh = async () => {
    const result = await apiRequest<{ members: Member[] }>('/api/team', { method: 'GET' });
    if (result.ok) setMembers(result.data.members ?? []);
    const staffResult = await apiRequest<{ staff: StaffRow[] }>('/api/staff', { method: 'GET' });
    if (staffResult.ok) setStaff(staffResult.data.staff ?? []);
    router.refresh();
  };

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest<{ invitationToken?: string }>('/api/team', { body: inviteForm });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(
      result.data.invitationToken
        ? `Invited — dev invite link: /accept-invite?token=${result.data.invitationToken.slice(0, 12)}…`
        : 'Invitation email sent',
      'success',
    );
    setInviteOpen(false);
    setInviteForm({ name: '', email: '', role: 'STAFF', title: '' });
    await refresh();
  };

  const changeRole = async (member: Member, role: string) => {
    const result = await apiRequest('/api/team', { method: 'PATCH', body: { userId: member.userId, role } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push(`${member.name} is now ${roleLabel(role)}`, 'success');
    await refresh();
  };

  const setStatus = async (member: Member, status: string) => {
    const result = await apiRequest('/api/team', { method: 'PATCH', body: { userId: member.userId, status } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    await refresh();
  };

  const removeMember = async (member: Member) => {
    if (!confirm(`Remove ${member.name} from this workspace?`)) return;
    const result = await apiRequest('/api/team', { method: 'DELETE', body: { userId: member.userId } });
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Member removed', 'success');
    await refresh();
  };

  const createStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await apiRequest('/api/staff', {
      body: { ...staffForm, specialties: staffForm.specialties.split(',').map((item) => item.trim()).filter(Boolean) },
    });
    setBusy(false);
    if (!result.ok) {
      push(result.error, 'danger');
      return;
    }
    push('Staff member added — they can now be booked in appointments', 'success');
    setStaffOpen(false);
    setStaffForm({ name: '', title: '', email: '', phone: '', specialties: '' });
    await refresh();
  };

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'members', label: 'Users & roles', count: members.length },
          { id: 'staff', label: 'Bookable staff', count: staff.length },
          { id: 'audit', label: 'Audit log', count: auditLogs.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'members' ? (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Workspace users</h2>
              <p className="muted text-xs">
                {limits.used} of {limits.users} seats used on the {limits.plan} plan
              </p>
            </div>
            {canManage ? (
              <Button size="sm" onClick={() => setInviteOpen(true)} disabled={limits.used >= limits.users}>
                <UserPlus className="h-4 w-4" /> Invite user
              </Button>
            ) : (
              <Badge tone="neutral">Your role can view but not manage users</Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b">
                  {['Name', 'Email', 'Role', 'Status', 'Joined', 'Last login', ''].map((column) => (
                    <th key={column} className="table-head px-4 py-2">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="table-row border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">
                      {member.name}
                      {member.userId === currentUserId ? <span className="muted ml-2 text-xs">(you)</span> : null}
                      {member.title ? <p className="muted text-xs">{member.title}</p> : null}
                    </td>
                    <td className="px-4 py-3">{member.email}</td>
                    <td className="px-4 py-3">
                      {canManage && member.role !== 'OWNER' ? (
                        <Select
                          value={member.role}
                          onChange={(event) => changeRole(member, event.target.value)}
                          className="w-auto text-xs"
                          aria-label={`Role for ${member.name}`}
                        >
                          {BUSINESS_ROLES.filter((role) => role !== 'OWNER').map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>{roleLabel(member.role)}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={member.status} />
                    </td>
                    <td className="muted px-4 py-3 text-xs">{formatDate(member.joined_at)}</td>
                    <td className="muted px-4 py-3 text-xs">
                      {member.last_login_at ? formatDate(member.last_login_at) : 'never'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && member.role !== 'OWNER' ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => setStatus(member, member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED')}>
                            {member.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeMember(member)}>
                            Remove
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'staff' ? (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Bookable staff</h2>
              <p className="muted text-xs">
                Staff records hold specialties and availability used by appointment scheduling and the AI booking
                assistant.
              </p>
            </div>
            {canManage ? (
              <Button size="sm" onClick={() => setStaffOpen(true)}>
                <Plus className="h-4 w-4" /> Add staff member
              </Button>
            ) : null}
          </div>
          {staff.length === 0 ? (
            <p className="muted p-5 text-sm">No staff records yet. Add the people customers can book.</p>
          ) : (
            <ul className="divide-y">
              {staff.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {member.name}
                      {member.active ? null : <span className="muted ml-2 text-xs">inactive</span>}
                    </p>
                    <p className="muted text-xs">
                      {member.title ?? 'Staff'}
                      {member.email ? ` · ${member.email}` : ''}
                      {member.phone ? ` · ${member.phone}` : ''}
                    </p>
                    {member.specialties?.length ? (
                      <p className="muted mt-1 text-xs">Specialties: {member.specialties.join(', ')}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="info">
                      {staffLoad.find((row) => row.id === member.id)?.appointments ?? 0} upcoming appointments
                    </Badge>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const result = await apiRequest('/api/staff', {
                            method: 'PATCH',
                            body: { id: member.id, active: !member.active },
                          });
                          if (!result.ok) {
                            push(result.error, 'danger');
                            return;
                          }
                          await refresh();
                        }}
                      >
                        {member.active ? 'Deactivate' : 'Activate'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'audit' ? (
        <div className="space-y-3">
          <Alert tone="info" title="Every privileged action is recorded">
            Role changes, invitations, plan changes, booking generation and AI escalations are appended to the audit log
            with the actor, entity and timestamp.
          </Alert>
          <Card className="p-0">
            {auditLogs.length === 0 ? (
              <p className="muted p-5 text-sm">No audit entries visible for your role.</p>
            ) : (
              <ul className="divide-y text-sm">
                {auditLogs.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-medium">{entry.action}</p>
                      <p className="muted text-xs">
                        {entry.actor_email ?? 'system'}
                        {entry.entity_type ? ` · ${entry.entity_type}` : ''}
                      </p>
                    </div>
                    <span className="muted text-xs">{entry.created_at.slice(0, 16).replace('T', ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a team member"
        description="They receive an email invitation and set their own password."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={invite} loading={busy}>
              <Shield className="h-4 w-4" /> Send invitation
            </Button>
          </>
        }
      >
        <form onSubmit={invite} className="space-y-4">
          <Field label="Full name" required>
            <Input required value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} />
          </Field>
          <Field label="Work email" required>
            <Input required type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
          </Field>
          <Field label="Role" hint={ROLE_PERMISSIONS[inviteForm.role as keyof typeof ROLE_PERMISSIONS]?.join(', ')}>
            <Select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>
              {BUSINESS_ROLES.filter((role) => role !== 'OWNER').map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Job title">
            <Input value={inviteForm.title} onChange={(event) => setInviteForm({ ...inviteForm, title: event.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={staffOpen}
        onClose={() => setStaffOpen(false)}
        title="Add bookable staff"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStaffOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createStaff} loading={busy}>
              <Users className="h-4 w-4" /> Add staff member
            </Button>
          </>
        }
      >
        <form onSubmit={createStaff} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2">
            <Input required value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} />
          </Field>
          <Field label="Title">
            <Input value={staffForm.title} onChange={(event) => setStaffForm({ ...staffForm, title: event.target.value })} placeholder="Senior stylist" />
          </Field>
          <Field label="Specialties" hint="Comma separated">
            <Input
              value={staffForm.specialties}
              onChange={(event) => setStaffForm({ ...staffForm, specialties: event.target.value })}
              placeholder="Braids, Colour, Barbering"
            />
          </Field>
          <Field label="Email">
            <Input type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={staffForm.phone} onChange={(event) => setStaffForm({ ...staffForm, phone: event.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
