import { z } from 'zod';
import {
  APPOINTMENT_STATUSES,
  BUSINESS_ROLES,
  BUSINESS_TYPES,
  CUSTOMER_STATUSES,
  DOCUMENT_TYPES,
  LEAD_STAGES,
  MARKETING_CHANNELS,
  MARKETING_POST_FLOW,
  ORDER_STATUSES,
  REPORT_PERIODS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TICKET_STATUSES,
} from '@/lib/domain';

export const idSchema = z.string().min(3).max(64);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: 'Password must include at least one letter and one number',
  });

/** Client-safe password rules (mirrors the server-side schema). */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Use at least 8 characters');
  if (!/[A-Za-z]/.test(password)) issues.push('Include at least one letter');
  if (!/[0-9]/.test(password)) issues.push('Include at least one number');
  return issues;
}

export const signupSchema = z.object({
  name: z.string().min(2, 'Tell us your name').max(120),
  email: z.string().email('Enter a valid email address').max(200),
  password: passwordSchema,
  phone: z.string().max(40).optional().or(z.literal('')),
  marketingOptIn: z.boolean().optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
});

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Reset link is invalid'),
  password: passwordSchema,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10, 'Invitation link is invalid'),
  password: passwordSchema,
  name: z.string().min(2).max(120).optional(),
});

export const profileSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(40).optional().or(z.literal('')),
  jobTitle: z.string().max(120).optional().or(z.literal('')),
  timezone: z.string().max(64).optional().or(z.literal('')),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

export const businessHoursSchema = z.array(
  z.object({
    day: z.string().min(3).max(12),
    open: z.string().max(5).default('09:00'),
    close: z.string().max(5).default('17:00'),
    closed: z.boolean().default(false),
  }),
);

export const businessProfileSchema = z.object({
  name: z.string().min(2, 'Business name is required').max(160),
  type: z.enum(BUSINESS_TYPES.map((type) => type.value) as [string, ...string[]]),
  description: z.string().max(2000).optional().or(z.literal('')),
  address: z.string().max(240).optional().or(z.literal('')),
  city: z.string().max(120).optional().or(z.literal('')),
  country: z.string().max(120).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  website: z.string().max(240).optional().or(z.literal('')),
  timezone: z.string().max(64).optional().or(z.literal('')),
  currency: z.string().length(3).optional(),
  hours: businessHoursSchema.optional(),
  comms: z
    .object({
      preferredChannel: z.enum(['WHATSAPP', 'EMAIL', 'SMS', 'PHONE', 'WEB_CHAT']).default('EMAIL'),
      whatsapp: z.string().max(40).optional().or(z.literal('')),
      escalateTo: z.string().max(200).optional().or(z.literal('')),
      autoReply: z.boolean().default(true),
      sendAppointmentReminders: z.boolean().default(true),
      reminderLeadHours: z.number().int().min(1).max(168).default(24),
    })
    .optional(),
  onboardingStep: z.number().int().min(0).max(10).optional(),
  complete: z.boolean().optional(),
});

export const serviceSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(1000).optional().or(z.literal('')),
  category: z.string().max(80).optional().or(z.literal('')),
  price: z.union([z.string(), z.number()]).default('0'),
  durationMinutes: z.coerce.number().int().min(5).max(1440).default(60),
  active: z.boolean().default(true),
});

export const productSchema = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().max(60).optional().or(z.literal('')),
  category: z.string().max(80).optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  quantity: z.coerce.number().int().min(0).default(0),
  minStock: z.coerce.number().int().min(0).default(0),
  cost: z.union([z.string(), z.number()]).default('0'),
  price: z.union([z.string(), z.number()]).default('0'),
  supplier: z.string().max(160).optional().or(z.literal('')),
  unit: z.string().max(24).optional().or(z.literal('')),
  active: z.boolean().default(true),
});

export const stockAdjustSchema = z.object({
  productId: idSchema,
  type: z.enum(['IN', 'OUT', 'SALE', 'ADJUST', 'WASTE']),
  quantity: z.coerce.number().int().refine((value) => value !== 0, 'Quantity cannot be zero'),
  note: z.string().max(240).optional().or(z.literal('')),
});

export const staffSchema = z.object({
  name: z.string().min(2).max(120),
  title: z.string().max(120).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  specialties: z.array(z.string().max(60)).max(20).default([]),
  color: z.string().max(20).optional().or(z.literal('')),
  availability: z
    .record(
      z.string(),
      z.array(z.object({ start: z.string().max(5), end: z.string().max(5) })),
    )
    .optional(),
  active: z.boolean().default(true),
});

export const customerSchema = z.object({
  name: z.string().min(2, 'Customer name is required').max(160),
  phone: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  address: z.string().max(240).optional().or(z.literal('')),
  birthday: z.string().max(20).optional().or(z.literal('')),
  status: z.enum(CUSTOMER_STATUSES).default('NEW'),
  source: z.string().max(80).optional().or(z.literal('')),
  tags: z.array(z.string().max(40)).max(20).default([]),
  notes: z.string().max(4000).optional().or(z.literal('')),
});

export const leadSchema = z.object({
  name: z.string().min(2).max(160),
  phone: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  source: z.string().max(80).optional().or(z.literal('')),
  stage: z.enum(LEAD_STAGES).default('NEW_LEAD'),
  value: z.union([z.string(), z.number()]).default('0'),
  notes: z.string().max(4000).optional().or(z.literal('')),
  customerId: idSchema.optional().or(z.literal('')),
  nextFollowUpAt: z.string().max(40).optional().or(z.literal('')),
});

export const leadActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'EMAIL', 'SMS', 'MEETING', 'AI']).default('NOTE'),
  content: z.string().min(1).max(4000),
});

export const appointmentSchema = z.object({
  title: z.string().min(2).max(160),
  customerId: idSchema.optional().or(z.literal('')),
  staffId: idSchema.optional().or(z.literal('')),
  serviceId: idSchema.optional().or(z.literal('')),
  startAt: z.string().min(10, 'Start time is required'),
  endAt: z.string().min(10, 'End time is required'),
  status: z.enum(APPOINTMENT_STATUSES).default('CONFIRMED'),
  price: z.union([z.string(), z.number()]).default('0'),
  location: z.string().max(160).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  source: z.string().max(40).optional(),
});

export const taskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().or(z.literal('')),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  assigneeUserId: idSchema.optional().or(z.literal('')),
  dueAt: z.string().max(40).optional().or(z.literal('')),
});

export const orderSchema = z.object({
  customerId: idSchema.optional().or(z.literal('')),
  status: z.enum(ORDER_STATUSES).default('PAID'),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'PARTIAL', 'REFUNDED']).default('PAID'),
  paymentMethod: z.string().max(40).optional().or(z.literal('')),
  channel: z.string().max(40).optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
  tax: z.union([z.string(), z.number()]).default('0'),
  discount: z.union([z.string(), z.number()]).default('0'),
  placedAt: z.string().max(40).optional(),
  items: z
    .array(
      z.object({
        itemType: z.enum(['PRODUCT', 'SERVICE']),
        itemId: idSchema.optional().or(z.literal('')),
        name: z.string().min(1).max(160),
        quantity: z.coerce.number().int().min(1).max(1000),
        unitPrice: z.union([z.string(), z.number()]),
      }),
    )
    .min(1, 'Add at least one line item'),
});

export const conversationMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export const conversationCreateSchema = z.object({
  customerId: idSchema.optional().or(z.literal('')),
  channel: z.enum(['WEB_CHAT', 'WHATSAPP', 'SMS', 'EMAIL', 'PHONE', 'INSTAGRAM']).default('WEB_CHAT'),
  subject: z.string().max(200).optional().or(z.literal('')),
  contactName: z.string().max(160).optional().or(z.literal('')),
  contactEmail: z.string().email().max(200).optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional().or(z.literal('')),
  firstMessage: z.string().max(4000).optional().or(z.literal('')),
});

/** Public support widget: AI-first customer conversation. */
export const publicSupportSchema = z.object({
  businessSlug: z.string().min(2).max(64),
  conversationId: z.string().max(64).optional().or(z.literal('')),
  message: z.string().min(1).max(2000),
  name: z.string().max(160).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
});

export const faqSchema = z.object({
  question: z.string().min(4).max(400),
  answer: z.string().min(2).max(4000),
  category: z.string().max(80).optional().or(z.literal('')),
  published: z.boolean().default(true),
});

export const knowledgeTextSchema = z.object({
  title: z.string().min(2).max(200),
  kind: z.enum(['UPLOAD', 'FAQ', 'POLICY', 'CATALOG', 'MANUAL']).default('MANUAL'),
  body: z.string().min(20).max(200000),
});

export const supportSettingsSchema = z.object({
  greeting: z.string().max(600).optional().or(z.literal('')),
  tone: z.string().max(120).optional().or(z.literal('')),
  escalationMessage: z.string().max(600).optional().or(z.literal('')),
  handoffEmail: z.string().email().max(200).optional().or(z.literal('')),
  autoReplyEnabled: z.boolean().default(true),
  widgetEnabled: z.boolean().default(true),
});

export const ticketSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().max(4000).optional().or(z.literal('')),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  status: z.enum(TICKET_STATUSES).default('OPEN'),
  contactName: z.string().max(160).optional().or(z.literal('')),
  contactEmail: z.string().email().max(200).optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional().or(z.literal('')),
  conversationId: idSchema.optional().or(z.literal('')),
  customerId: idSchema.optional().or(z.literal('')),
});

export const assistantSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().max(64).optional().or(z.literal('')),
  surface: z.enum(['ASSISTANT', 'SALES', 'MARKETING', 'ANALYTICS', 'DOCUMENTS', 'SUPPORT']).default('ASSISTANT'),
});

export const documentGenerateSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  title: z.string().max(200).optional().or(z.literal('')),
  customerId: idSchema.optional().or(z.literal('')),
  instructions: z.string().max(4000).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        quantity: z.coerce.number().min(0).max(10000).default(1),
        unitPrice: z.union([z.string(), z.number()]).default('0'),
      }),
    )
    .max(60)
    .optional(),
  currency: z.string().length(3).default('USD'),
  dueDate: z.string().max(40).optional().or(z.literal('')),
});

export const marketingGenerateSchema = z.object({
  channel: z.enum(MARKETING_CHANNELS),
  goal: z.string().min(3).max(400),
  audience: z.string().max(300).optional().or(z.literal('')),
  offer: z.string().max(300).optional().or(z.literal('')),
  tone: z.string().max(80).optional().or(z.literal('')),
  campaignName: z.string().max(160).optional().or(z.literal('')),
  variants: z.coerce.number().int().min(1).max(5).default(3),
  scheduleStart: z.string().max(40).optional().or(z.literal('')),
});

export const campaignPlanSchema = z.object({
  objective: z.string().min(3).max(400),
  audience: z.string().max(300).optional().or(z.literal('')),
  durationDays: z.coerce.number().int().min(1).max(90).default(14),
  channels: z.array(z.enum(MARKETING_CHANNELS)).min(1).max(8),
});

export const marketingPostUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(8000).optional(),
  hashtags: z.string().max(400).optional(),
  status: z.enum(MARKETING_POST_FLOW).optional(),
  scheduledAt: z.string().max(40).optional().or(z.literal('')),
});

export const reportGenerateSchema = z.object({
  period: z.enum(REPORT_PERIODS),
  withAiSummary: z.boolean().default(true),
});

export const usageQuerySchema = z.object({
  metric: z.string().max(40).optional(),
  period: z.string().max(10).optional(),
});

export const planChangeSchema = z.object({
  planCode: z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS']),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

export const memberInviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(BUSINESS_ROLES).default('STAFF'),
  name: z.string().max(120).optional().or(z.literal('')),
  title: z.string().max(120).optional().or(z.literal('')),
});

export const memberUpdateSchema = z.object({
  role: z.enum(BUSINESS_ROLES).optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).optional(),
  title: z.string().max(120).optional().or(z.literal('')),
});

export const contactMessageSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().or(z.literal('')),
  company: z.string().max(160).optional().or(z.literal('')),
  topic: z.enum(['demo', 'sales', 'support', 'partnership', 'other']).default('demo'),
  message: z.string().min(10).max(4000),
  source: z.string().max(40).optional(),
});

export const publicBookingSchema = z.object({
  businessSlug: z.string().min(2).max(64),
  serviceId: idSchema.optional().or(z.literal('')),
  staffId: idSchema.optional().or(z.literal('')),
  startAt: z.string().min(10),
  customerName: z.string().min(2).max(160),
  customerPhone: z.string().max(40).optional().or(z.literal('')),
  customerEmail: z.string().email().max(200).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type LeadInput = z.infer<typeof leadSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
