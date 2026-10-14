import { all, get, json, nowIso, run, scalar, toJson } from '@/lib/db';
import { newId, slugify } from '@/lib/utils';
import type { BusinessRole, PlatformRole } from '@/lib/domain';

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  timezone: string | null;
  locale: string | null;
  theme: string | null;
  platform_role: string;
  status: string;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  timezone: string;
  theme: string;
  platformRole: PlatformRole;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    jobTitle: row.job_title,
    timezone: row.timezone ?? 'UTC',
    theme: row.theme ?? 'system',
    platformRole: (row.platform_role as PlatformRole) ?? 'USER',
    status: row.status,
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function findUserById(id: string): UserRow | undefined {
  return get<UserRow>(`SELECT * FROM users WHERE id = ?`, [id]);
}

export function findUserByEmail(email: string): UserRow | undefined {
  return get<UserRow>(`SELECT * FROM users WHERE lower(email) = lower(?)`, [email]);
}

export function countUsers(): number {
  return scalar<number>(`SELECT count(*) AS c FROM users`, []);
}

export function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string | null;
  jobTitle?: string | null;
  platformRole?: PlatformRole;
  /** `INVITED` keeps an invited account inert until the invitee sets a password. */
  status?: 'ACTIVE' | 'INVITED';
  emailVerifiedAt?: string | null;
  marketingOptIn?: boolean;
}): UserRow {
  const id = newId('usr');
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, name, phone, job_title, platform_role, status,
                        email_verified_at, marketing_opt_in, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.email.toLowerCase(),
      input.passwordHash,
      input.name,
      input.phone ?? null,
      input.jobTitle ?? null,
      input.platformRole ?? 'USER',
      input.status ?? 'ACTIVE',
      input.emailVerifiedAt ?? null,
      input.marketingOptIn ? 1 : 0,
      now,
      now,
    ],
  );
  return findUserById(id)!;
}

export function updateUser(
  id: string,
  patch: Partial<{
    name: string;
    phone: string | null;
    jobTitle: string | null;
    timezone: string;
    theme: string;
    avatarUrl: string | null;
    passwordHash: string;
    emailVerifiedAt: string | null;
    lastLoginAt: string;
    status: string;
  }>,
): void {
  const columns: Record<string, string> = {
    name: 'name',
    phone: 'phone',
    jobTitle: 'job_title',
    timezone: 'timezone',
    theme: 'theme',
    avatarUrl: 'avatar_url',
    passwordHash: 'password_hash',
    emailVerifiedAt: 'email_verified_at',
    lastLoginAt: 'last_login_at',
    status: 'status',
  };
  const sets: string[] = [];
  const params: (string | null)[] = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in patch) {
      sets.push(`${column} = ?`);
      params.push((patch as Record<string, string | null>)[key] ?? null);
    }
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso());
  params.push(id);
  run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function markUserLogin(id: string, ip?: string, userAgent?: string): void {
  run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, [nowIso(), nowIso(), id]);
  void ip;
  void userAgent;
}

// ---------------------------------------------------------------------------
// Sessions (opaque cookie token, hashed at rest)
// ---------------------------------------------------------------------------
export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  business_id: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_seen_at: string;
};

export function createSession(input: {
  userId: string;
  tokenHash: string;
  businessId?: string | null;
  expiresAt: string;
  ip?: string | null;
  userAgent?: string | null;
}): string {
  const id = newId('ses');
  const now = nowIso();
  run(
    `INSERT INTO sessions (id, user_id, token_hash, business_id, ip, user_agent, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.tokenHash,
      input.businessId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.expiresAt,
      now,
      now,
    ],
  );
  return id;
}

export function findSessionByTokenHash(tokenHash: string): SessionRow | undefined {
  return get<SessionRow>(`SELECT * FROM sessions WHERE token_hash = ?`, [tokenHash]);
}

export function touchSession(id: string): void {
  run(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`, [nowIso(), id]);
}

export function setSessionBusiness(id: string, businessId: string): void {
  run(`UPDATE sessions SET business_id = ?, last_seen_at = ? WHERE id = ?`, [businessId, nowIso(), id]);
}

export function revokeSession(id: string): void {
  run(`UPDATE sessions SET revoked_at = ? WHERE id = ?`, [nowIso(), id]);
}

export function revokeAllUserSessions(userId: string): void {
  run(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`, [nowIso(), userId]);
}

// ---------------------------------------------------------------------------
// One-time tokens (email verification, password reset)
// ---------------------------------------------------------------------------
export function createAuthToken(input: {
  userId: string;
  type: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'INVITE';
  tokenHash: string;
  email: string;
  expiresAt: string;
  meta?: unknown;
}): void {
  run(
    `INSERT INTO auth_tokens (id, user_id, type, token_hash, email, expires_at, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('tok'),
      input.userId,
      input.type,
      input.tokenHash,
      input.email.toLowerCase(),
      input.expiresAt,
      input.meta ? toJson(input.meta) : null,
      nowIso(),
    ],
  );
}

export function findAuthToken(tokenHash: string, type: string) {
  return get<{
    id: string;
    user_id: string;
    type: string;
    email: string;
    expires_at: string;
    used_at: string | null;
    meta_json: string | null;
  }>(`SELECT * FROM auth_tokens WHERE token_hash = ? AND type = ? ORDER BY created_at DESC LIMIT 1`, [
    tokenHash,
    type,
  ]);
}

export function consumeAuthToken(id: string): void {
  run(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`, [nowIso(), id]);
}

export function expireAuthTokens(userId: string, type: string): void {
  run(`UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND type = ? AND used_at IS NULL`, [
    nowIso(),
    userId,
    type,
  ]);
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------
export type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string;
  currency: string;
  logo_url: string | null;
  hours_json: string | null;
  comms_json: string | null;
  onboarding_step: number;
  onboarding_completed_at: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type BusinessHours = { day: string; open: string; close: string; closed: boolean }[];
export type CommsPrefs = {
  preferredChannel: string;
  whatsapp: string;
  escalateTo: string;
  autoReply: boolean;
  sendAppointmentReminders: boolean;
  reminderLeadHours: number;
};

export const DEFAULT_HOURS: BusinessHours = [
  { day: 'mon', open: '09:00', close: '17:00', closed: false },
  { day: 'tue', open: '09:00', close: '17:00', closed: false },
  { day: 'wed', open: '09:00', close: '17:00', closed: false },
  { day: 'thu', open: '09:00', close: '17:00', closed: false },
  { day: 'fri', open: '09:00', close: '17:00', closed: false },
  { day: 'sat', open: '10:00', close: '14:00', closed: false },
  { day: 'sun', open: '00:00', close: '00:00', closed: true },
];

export const DEFAULT_COMMS: CommsPrefs = {
  preferredChannel: 'WHATSAPP',
  whatsapp: '',
  escalateTo: '',
  autoReply: true,
  sendAppointmentReminders: true,
  reminderLeadHours: 24,
};

const DAY_ALIASES: Record<string, string> = {
  sunday: 'sun', monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu',
  friday: 'fri', saturday: 'sat', sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed',
  thu: 'thu', fri: 'fri', sat: 'sat',
};

/** Accepts both long ("monday") and short ("mon") day keys and stores the short form. */
export function normaliseHours(hours: unknown): BusinessHours {
  if (!Array.isArray(hours) || !hours.length) return DEFAULT_HOURS;
  const normalised: BusinessHours = [];
  for (const entry of hours as { day?: string; open?: string; close?: string; closed?: boolean }[]) {
    const day = DAY_ALIASES[String(entry.day ?? '').toLowerCase()];
    if (!day) continue;
    normalised.push({
      day,
      open: entry.open || '09:00',
      close: entry.close || '17:00',
      closed: Boolean(entry.closed),
    });
  }
  if (!normalised.length) return DEFAULT_HOURS;
  // Keep a stable, calendar-ordered week.
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return normalised.sort((left, right) => order.indexOf(left.day) - order.indexOf(right.day));
}

export function hoursFor(row: BusinessRow): BusinessHours {
  return normaliseHours(json<unknown>(row.hours_json, DEFAULT_HOURS));
}

export function commsFor(row: BusinessRow): CommsPrefs {
  return { ...DEFAULT_COMMS, ...json<Partial<CommsPrefs>>(row.comms_json, {}) };
}

export function findBusinessById(id: string): BusinessRow | undefined {
  return get<BusinessRow>(`SELECT * FROM businesses WHERE id = ?`, [id]);
}

export function findBusinessBySlug(slug: string): BusinessRow | undefined {
  return get<BusinessRow>(`SELECT * FROM businesses WHERE slug = ?`, [slug]);
}

export function findBusinessesByUser(userId: string): BusinessRow[] {
  return all<BusinessRow>(
    `SELECT b.* FROM businesses b
     JOIN business_members m ON m.business_id = b.id
     WHERE m.user_id = ? AND m.status = 'ACTIVE'
     ORDER BY b.created_at ASC`,
    [userId],
  );
}

export function uniqueBusinessSlug(name: string): string {
  const base = slugify(name) || 'business';
  let candidate = base;
  let counter = 1;
  while (findBusinessBySlug(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export function createBusiness(input: {
  name: string;
  type: string;
  ownerId: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone?: string;
  currency?: string;
  hours?: BusinessHours;
  comms?: Partial<CommsPrefs>;
}): BusinessRow {
  const id = newId('biz');
  const now = nowIso();
  run(
    `INSERT INTO businesses (id, name, slug, type, description, address, city, country, phone, email, website,
                             timezone, currency, hours_json, comms_json, onboarding_step, owner_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id,
      input.name,
      uniqueBusinessSlug(input.name),
      input.type,
      input.description ?? null,
      input.address ?? null,
      input.city ?? null,
      input.country ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.website ?? null,
      input.timezone ?? 'UTC',
      input.currency ?? 'USD',
      toJson(input.hours ?? DEFAULT_HOURS),
      toJson({ ...DEFAULT_COMMS, ...(input.comms ?? {}) }),
      input.ownerId,
      now,
      now,
    ],
  );
  return findBusinessById(id)!;
}

export function updateBusiness(
  id: string,
  patch: Partial<{
    name: string;
    type: string;
    description: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    timezone: string;
    currency: string;
    hours: BusinessHours;
    comms: CommsPrefs;
    onboardingStep: number;
    onboardingCompletedAt: string | null;
    logoUrl: string | null;
  }>,
): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const push = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };
  if (patch.name !== undefined) push('name', patch.name);
  if (patch.type !== undefined) push('type', patch.type);
  if (patch.description !== undefined) push('description', patch.description);
  if (patch.address !== undefined) push('address', patch.address);
  if (patch.city !== undefined) push('city', patch.city);
  if (patch.country !== undefined) push('country', patch.country);
  if (patch.phone !== undefined) push('phone', patch.phone);
  if (patch.email !== undefined) push('email', patch.email);
  if (patch.website !== undefined) push('website', patch.website);
  if (patch.timezone !== undefined) push('timezone', patch.timezone);
  if (patch.currency !== undefined) push('currency', patch.currency);
  if (patch.logoUrl !== undefined) push('logo_url', patch.logoUrl);
  if (patch.hours !== undefined) push('hours_json', toJson(normaliseHours(patch.hours)));
  if (patch.comms !== undefined) push('comms_json', toJson(patch.comms));
  if (patch.onboardingStep !== undefined) push('onboarding_step', patch.onboardingStep);
  if (patch.onboardingCompletedAt !== undefined) push('onboarding_completed_at', patch.onboardingCompletedAt);
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso());
  params.push(id);
  run(`UPDATE businesses SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function countBusinesses(): number {
  return scalar<number>(`SELECT count(*) AS c FROM businesses`, []);
}

export function listAllBusinesses(limit = 200) {
  return all<
    BusinessRow & {
      owner_email: string | null;
      owner_name: string | null;
      plan_code: string | null;
      subscription_status: string | null;
      member_count: number;
      customer_count: number;
    }
  >(
    `SELECT b.*, u.email AS owner_email, u.name AS owner_name,
            s.plan_code, s.status AS subscription_status,
            (SELECT count(*) FROM business_members m WHERE m.business_id = b.id AND m.status = 'ACTIVE') AS member_count,
            (SELECT count(*) FROM customers c WHERE c.business_id = b.id) AS customer_count
     FROM businesses b
     LEFT JOIN users u ON u.id = b.owner_id
     LEFT JOIN subscriptions s ON s.business_id = b.id
     ORDER BY b.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

// ---------------------------------------------------------------------------
// Memberships & tenancy
// ---------------------------------------------------------------------------
export type MemberRow = {
  id: string;
  business_id: string;
  user_id: string;
  role: string;
  status: string;
  title: string | null;
  joined_at: string | null;
  created_at: string;
};

export function findMembership(businessId: string, userId: string): MemberRow | undefined {
  return get<MemberRow>(`SELECT * FROM business_members WHERE business_id = ? AND user_id = ?`, [
    businessId,
    userId,
  ]);
}

export function addMember(input: {
  businessId: string;
  userId: string;
  role: BusinessRole;
  status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  title?: string | null;
  invitedById?: string | null;
}): MemberRow {
  const id = newId('mem');
  const now = nowIso();
  run(
    `INSERT INTO business_members (id, business_id, user_id, role, status, title, invited_by_id, joined_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.businessId,
      input.userId,
      input.role,
      input.status ?? 'ACTIVE',
      input.title ?? null,
      input.invitedById ?? null,
      (input.status ?? 'ACTIVE') === 'ACTIVE' ? now : null,
      now,
      now,
    ],
  );
  return findMembership(input.businessId, input.userId)!;
}

export function updateMember(
  businessId: string,
  userId: string,
  patch: Partial<{ role: BusinessRole; status: string; title: string | null }>,
): void {
  const sets: string[] = [];
  const params: (string | null)[] = [];
  if (patch.role !== undefined) {
    sets.push('role = ?');
    params.push(patch.role);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
    if (patch.status === 'ACTIVE') sets.push(`joined_at = '${nowIso()}'`);
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso());
  params.push(businessId, userId);
  run(`UPDATE business_members SET ${sets.join(', ')} WHERE business_id = ? AND user_id = ?`, params);
}

export function removeMember(businessId: string, userId: string): void {
  run(`DELETE FROM business_members WHERE business_id = ? AND user_id = ?`, [businessId, userId]);
}

export function listMembers(businessId: string) {
  return all<{
    id: string;
    user_id: string;
    role: string;
    status: string;
    title: string | null;
    name: string;
    email: string;
    avatar_url: string | null;
    joined_at: string | null;
    last_login_at: string | null;
  }>(
    `SELECT m.id, m.user_id, m.role, m.status, m.title, u.name, u.email, u.avatar_url, m.joined_at, u.last_login_at
     FROM business_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.business_id = ?
     ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 ELSE 3 END, u.name`,
    [businessId],
  );
}

/**
 * Invitations waiting for the invitee to set a password. Used by the
 * accept-invite flow, which is the only place a user may join a business they
 * were not already part of.
 */
export function listPendingInvitations(userId: string) {
  return all<{
    member_id: string;
    role: string;
    title: string | null;
    invited_at: string;
    business_id: string;
    business_name: string;
    business_slug: string;
  }>(
    `SELECT m.id AS member_id, m.role, m.title, m.created_at AS invited_at,
            b.id AS business_id, b.name AS business_name, b.slug AS business_slug
     FROM business_members m
     JOIN businesses b ON b.id = m.business_id
     WHERE m.user_id = ? AND m.status = 'INVITED'
     ORDER BY m.created_at ASC`,
    [userId],
  );
}

export function countMembers(businessId: string): number {
  return scalar<number>(
    `SELECT count(*) AS c FROM business_members WHERE business_id = ? AND status = 'ACTIVE'`,
    [businessId],
  );
}

// ---------------------------------------------------------------------------
// Staff (bookable resources)
// ---------------------------------------------------------------------------
export type StaffRow = {
  id: string;
  business_id: string;
  user_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  specialties: string | null;
  availability_json: string | null;
  color: string | null;
  active: number;
  created_at: string;
};

export function listStaff(businessId: string, onlyActive = false): StaffRow[] {
  return all<StaffRow>(
    `SELECT * FROM staff WHERE business_id = ? ${onlyActive ? 'AND active = 1' : ''} ORDER BY name ASC`,
    [businessId],
  );
}

export function findStaff(businessId: string, id: string): StaffRow | undefined {
  return get<StaffRow>(`SELECT * FROM staff WHERE business_id = ? AND id = ?`, [businessId, id]);
}

export function createStaff(
  businessId: string,
  input: {
    name: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    specialties?: string[];
    availability?: Record<string, { start: string; end: string }[]>;
    color?: string | null;
    userId?: string | null;
  },
): StaffRow {
  const id = newId('stf');
  const now = nowIso();
  run(
    `INSERT INTO staff (id, business_id, user_id, name, title, email, phone, specialties, availability_json, color, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      businessId,
      input.userId ?? null,
      input.name,
      input.title ?? null,
      input.email ?? null,
      input.phone ?? null,
      toJson(input.specialties ?? []),
      toJson(
        input.availability ?? {
          mon: [{ start: '09:00', end: '17:00' }],
          tue: [{ start: '09:00', end: '17:00' }],
          wed: [{ start: '09:00', end: '17:00' }],
          thu: [{ start: '09:00', end: '17:00' }],
          fri: [{ start: '09:00', end: '17:00' }],
        },
      ),
      input.color ?? '#3382fb',
      now,
      now,
    ],
  );
  return findStaff(businessId, id)!;
}

export function updateStaff(
  businessId: string,
  id: string,
  patch: Partial<{
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    specialties: string[];
    availability: Record<string, { start: string; end: string }[]>;
    color: string | null;
    active: boolean;
  }>,
): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    params.push(patch.title);
  }
  if (patch.email !== undefined) {
    sets.push('email = ?');
    params.push(patch.email);
  }
  if (patch.phone !== undefined) {
    sets.push('phone = ?');
    params.push(patch.phone);
  }
  if (patch.specialties !== undefined) {
    sets.push('specialties = ?');
    params.push(toJson(patch.specialties));
  }
  if (patch.availability !== undefined) {
    sets.push('availability_json = ?');
    params.push(toJson(patch.availability));
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    params.push(patch.color);
  }
  if (patch.active !== undefined) {
    sets.push('active = ?');
    params.push(patch.active ? 1 : 0);
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  params.push(nowIso());
  params.push(businessId, id);
  run(`UPDATE staff SET ${sets.join(', ')} WHERE business_id = ? AND id = ?`, params);
}

export function deleteStaff(businessId: string, id: string): void {
  run(`DELETE FROM staff WHERE business_id = ? AND id = ?`, [businessId, id]);
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export function recordAudit(input: {
  businessId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: unknown;
}): void {
  run(
    `INSERT INTO audit_logs (id, business_id, actor_user_id, actor_email, action, entity_type, entity_id, ip, user_agent, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('aud'),
      input.businessId ?? null,
      input.actorUserId ?? null,
      input.actorEmail ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.meta ? toJson(input.meta) : null,
      nowIso(),
    ],
  );
}

export function listAuditLogs(businessId: string, limit = 100) {
  return all<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    actor_email: string | null;
    created_at: string;
    meta_json: string | null;
  }>(
    `SELECT id, action, entity_type, entity_id, actor_email, created_at, meta_json
     FROM audit_logs WHERE business_id = ? ORDER BY created_at DESC LIMIT ?`,
    [businessId, limit],
  );
}

export function listPlatformAuditLogs(limit = 100) {
  return all<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    actor_email: string | null;
    business_id: string | null;
    created_at: string;
  }>(
    `SELECT id, action, entity_type, entity_id, actor_email, business_id, created_at
     FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}
