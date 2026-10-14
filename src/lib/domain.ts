/**
 * Domain vocabulary shared by the API layer, the UI and the AI services.
 * Keeping it in one place guarantees that permission checks, status filters and
 * AI grounding labels never drift apart.
 */

export const BUSINESS_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const PLATFORM_ROLES = ['USER', 'PLATFORM_ADMIN'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Permission matrix. The API layer is the enforcement point: every mutating
 * handler resolves the caller's membership and asserts the required permission
 * before touching tenant data.
 */
export const PERMISSIONS = [
  'business:read',
  'business:update',
  'business:delete',
  'members:read',
  'members:manage',
  'customers:read',
  'customers:write',
  'leads:read',
  'leads:write',
  'appointments:read',
  'appointments:write',
  'tasks:read',
  'tasks:write',
  'products:read',
  'products:write',
  'orders:read',
  'orders:write',
  'conversations:read',
  'conversations:write',
  'knowledge:read',
  'knowledge:write',
  'documents:read',
  'documents:write',
  'marketing:read',
  'marketing:write',
  'reports:read',
  'analytics:read',
  'ai:use',
  'billing:read',
  'billing:manage',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<BusinessRole, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((permission) => permission !== 'business:delete'),
  MANAGER: [
    'business:read',
    'members:read',
    'customers:read',
    'customers:write',
    'leads:read',
    'leads:write',
    'appointments:read',
    'appointments:write',
    'tasks:read',
    'tasks:write',
    'products:read',
    'products:write',
    'orders:read',
    'orders:write',
    'conversations:read',
    'conversations:write',
    'knowledge:read',
    'documents:read',
    'documents:write',
    'marketing:read',
    'marketing:write',
    'reports:read',
    'analytics:read',
    'ai:use',
    'billing:read',
  ],
  STAFF: [
    'business:read',
    'customers:read',
    'customers:write',
    'leads:read',
    'appointments:read',
    'appointments:write',
    'tasks:read',
    'tasks:write',
    'products:read',
    'orders:read',
    'conversations:read',
    'conversations:write',
    'knowledge:read',
    'documents:read',
    'reports:read',
    'ai:use',
  ],
};

export function roleHasPermission(role: BusinessRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function roleRank(role: BusinessRole): number {
  return ['STAFF', 'MANAGER', 'ADMIN', 'OWNER'].indexOf(role);
}

// ---------------------------------------------------------------------------
// Industry verticals (used on the landing page and to seed industry tooling)
// ---------------------------------------------------------------------------
export const BUSINESS_TYPES = [
  { value: 'salon', label: 'Salon / Spa / Beauty' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar / Lounge' },
  { value: 'retail', label: 'Retail Store' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'clinic', label: 'Clinic / Healthcare' },
  { value: 'hotel', label: 'Hotel / Hospitality' },
  { value: 'services', label: 'Service Business' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'agency', label: 'Agency' },
  { value: 'other', label: 'Other / Small Company' },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]['value'];

export function businessTypeLabel(value: string): string {
  return BUSINESS_TYPES.find((type) => type.value === value)?.label ?? 'Business';
}

export const CUSTOMER_STATUSES = ['NEW', 'LEAD', 'ACTIVE', 'RETURNING', 'INACTIVE', 'VIP'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const LEAD_STAGES = [
  'NEW_LEAD',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW_LEAD: 'New Lead',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const ORDER_STATUSES = ['PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'] as const;

export const CONVERSATION_STATUSES = ['OPEN', 'PENDING', 'ESCALATED', 'CLOSED'] as const;
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

export const MARKETING_CHANNELS = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'LINKEDIN',
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'GOOGLE',
] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const MARKETING_POST_FLOW = ['DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHED'] as const;
export type MarketingPostStatus = (typeof MARKETING_POST_FLOW)[number];

export const DOCUMENT_TYPES = [
  'INVOICE',
  'QUOTE',
  'RECEIPT',
  'PROPOSAL',
  'REPORT',
  'MESSAGE',
  'MARKETING_PLAN',
  'SOP',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const REPORT_PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const NOTIFICATION_TYPES = [
  'NEW_CUSTOMER',
  'NEW_LEAD',
  'NEW_APPOINTMENT',
  'LOW_INVENTORY',
  'SUPPORT_ESCALATION',
  'BUSINESS_ALERT',
  'TASK_DUE',
  'AI',
] as const;

/**
 * Grounding labels — every AI answer in the product is tagged with one of these
 * so a recommendation can never be mistaken for a stored fact.
 */
export const GROUNDING_LABELS = {
  VERIFIED_DATA: 'Verified business data',
  BUSINESS_DOCUMENT: 'Uploaded business document',
  AI_RECOMMENDATION: 'AI recommendation',
  INSUFFICIENT: 'Not enough information',
} as const;
export type GroundingKind = keyof typeof GROUNDING_LABELS;

export const CHANNEL_LABELS: Record<string, string> = {
  WEB_CHAT: 'Website chat',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
  PHONE: 'Phone',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  GOOGLE: 'Google',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  IN_STORE: 'In store',
  ONLINE: 'Online',
  DASHBOARD: 'Dashboard',
  AI_ASSISTANT: 'AI assistant',
  PUBLIC_BOOKING: 'Online booking',
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel.replace(/_/g, ' ').toLowerCase();
}

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'rafealgomez94@gmail.com';
export const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '0774075285';
export const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || '0888937524';
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Workspace Digital';

// ---------------------------------------------------------------------------
// Presentation helpers shared by the dashboard UI
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<BusinessRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  STAFF: 'Staff',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as BusinessRole] ?? titleLabel(role);
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Invoice',
  QUOTE: 'Quotation',
  RECEIPT: 'Receipt',
  PROPOSAL: 'Proposal',
  REPORT: 'Report',
  MESSAGE: 'Customer message',
  MARKETING_PLAN: 'Marketing plan',
  SOP: 'Standard operating procedure',
};

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? titleLabel(type);
}

export function titleLabel(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Channels a business can be contacted on (dashboard + AI guardrails). */
export const CHANNELS = ['WEB_CHAT', 'WHATSAPP', 'SMS', 'EMAIL', 'PHONE', 'INSTAGRAM'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Country dial code applied when the configured WhatsApp number is written in
 * national form (leading 0). Override with NEXT_PUBLIC_SUPPORT_DIAL_CODE — e.g.
 * 264 for Namibia, 27 for South Africa, 44 for the United Kingdom.
 */
const WHATSAPP_DIAL_CODE = (process.env.NEXT_PUBLIC_SUPPORT_DIAL_CODE || '264').replace(/\D/g, '');

/** International (E.164 without the plus) form of the support WhatsApp number. */
function toInternational(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `${WHATSAPP_DIAL_CODE}${digits.replace(/^0+/, '')}`;
  return digits;
}

/**
 * Deep link to WhatsApp. Pass `text` to pre-fill the message; the number is
 * normalised exactly once here so every surface (widget, footer, manager card,
 * landing page) opens the same conversation.
 */
export function whatsappHref(text?: string): string {
  const number = toInternational(SUPPORT_WHATSAPP);
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${number}${query}`;
}

export const WHATSAPP_DEFAULT_MESSAGE =
  'Hi, I would like to know more about Workspace Digital and my business.';

export const SUPPORT = {
  email: SUPPORT_EMAIL,
  whatsapp: SUPPORT_WHATSAPP,
  /** The number exactly as configured, formatted for display. */
  whatsappDisplay: SUPPORT_WHATSAPP.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'),
  whatsappInternational: `+${toInternational(SUPPORT_WHATSAPP)}`,
  whatsappHref: whatsappHref(WHATSAPP_DEFAULT_MESSAGE),
  phone: SUPPORT_PHONE,
  phoneDisplay: SUPPORT_PHONE.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'),
} as const;

export const COMMS_PREFERENCE_LABELS: Record<string, string> = {
  WEB_CHAT: 'Website chat widget',
  WHATSAPP: 'WhatsApp messages',
  SMS: 'SMS messages',
  EMAIL: 'Email',
  PHONE: 'Phone calls',
  INSTAGRAM: 'Instagram direct messages',
};

export const STOCK_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
