import Link from 'next/link';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileText,
  Gauge,
  Layers,
  LineChart,
  Lock,
  MessageSquare,
  Megaphone,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  UserRound,
  Users,
  Wallet,
  Workflow,
  XCircle,
} from 'lucide-react';
import { MarketingFooter, MarketingNav } from '@/components/marketing/site-chrome';
import { DemoForm } from '@/components/marketing/demo-form';
import { ManagerCard } from '@/components/manager-card';
import { Badge, Button, StatusBadge } from '@/components/ui';
import { PLAN_CATALOGUE } from '@/lib/db/repositories/platform';
import { APP_NAME, SUPPORT, SUPPORT_EMAIL, SUPPORT_PHONE, WHATSAPP_DEFAULT_MESSAGE, whatsappHref } from '@/lib/domain';
import { formatMoney } from '@/lib/utils';

const PROBLEMS = [
  {
    icon: MessageSquare,
    title: 'Customer messages pile up',
    body: 'Questions arrive on WhatsApp, email, Instagram and in person. Someone has to answer all of them, and nobody can do it fast enough.',
  },
  {
    icon: ClipboardList,
    title: 'Everything lives in notebooks and chats',
    body: 'Customer details, appointments, prices and orders are spread across paper, phones and spreadsheets. Nothing connects.',
  },
  {
    icon: Clock,
    title: 'Bookings and no-shows eat revenue',
    body: 'Double bookings, forgotten appointments and unanswered booking requests quietly cost money every single week.',
  },
  {
    icon: Boxes,
    title: 'Stock runs out without warning',
    body: 'Nobody notices a best seller is nearly finished until a customer asks for it and it is gone.',
  },
  {
    icon: BarChart3,
    title: 'No clear picture of the numbers',
    body: 'Owners can feel that the month was slow but cannot see which product, service or channel caused it.',
  },
  {
    icon: Megaphone,
    title: 'Marketing never gets done',
    body: 'There is no time to write posts, offers and follow-up messages, so growth depends on walk-ins alone.',
  },
];

const SOLUTIONS = [
  {
    icon: Bot,
    title: 'AI business assistant',
    body: 'Ask your business questions in plain language — customers, best sellers, low stock, follow-ups — and get answers from your own verified data.',
    tag: 'Answers from live data',
  },
  {
    icon: ShieldCheck,
    title: 'AI customer support',
    body: 'Customers get instant answers from your menu, price list and policies. When the AI is not confident it hands over to a human and captures the contact details.',
    tag: 'Never guesses',
  },
  {
    icon: Wallet,
    title: 'AI sales assistant',
    body: 'Qualify leads, score them automatically, draft follow-ups and move deals through a pipeline from first enquiry to won.',
    tag: 'Pipeline included',
  },
  {
    icon: CalendarCheck,
    title: 'Smart appointments',
    body: 'Real availability from your opening hours and staff schedules, online booking, confirmations and reminders.',
    tag: 'No double bookings',
  },
  {
    icon: Megaphone,
    title: 'AI marketing workspace',
    body: 'Generate social posts, adverts, email and SMS campaigns and a content calendar. You review and approve before anything goes out.',
    tag: 'You approve, always',
  },
  {
    icon: FileText,
    title: 'AI documents & reports',
    body: 'Invoices, quotes, proposals, receipts, SOPs and daily, weekly or monthly business reports — exportable as PDF.',
    tag: 'PDF export',
  },
];

const FEATURES = [
  { icon: Gauge, title: 'Operations dashboard', body: 'Revenue, customers, leads, orders, appointments, tasks, inventory and AI activity in one view.' },
  { icon: Users, title: 'CRM and customer history', body: 'Full profile for every customer: purchases, appointments, conversations, notes, tags and status.' },
  { icon: BarChart3, title: 'Customer service workspace', body: 'One inbox for web chat, WhatsApp, SMS, email and phone with AI drafting and escalation.' },
  { icon: ShoppingCart, title: 'Orders and sales tracking', body: 'Record orders in seconds, see top sellers and channel performance, keep stock accurate automatically.' },
  { icon: Database, title: 'Knowledge base', body: 'Upload menus, price lists, service catalogues and policies. Your AI answers from your documents.' },
  { icon: Workflow, title: 'Automation and tasks', body: 'Task lists, deadlines, priorities, assignments and AI-suggested tasks from real business activity.' },
  { icon: Layers, title: 'Roles and team access', body: 'Owner, Admin, Manager and Staff roles with audit logs, so the right people see the right data.' },
  { icon: Lock, title: 'Secure multi-tenant platform', body: 'Every business has an isolated workspace with per-tenant data access enforced on the server.' },
  { icon: CreditCard, title: 'Plans that scale', body: 'Start free, upgrade when you grow. Usage limits for AI messages, users, documents and storage.' },
];

const STEPS = [
  { number: '01', title: 'Create your account', body: 'Sign up in under a minute with email and password. No card required on the free plan.' },
  { number: '02', title: 'Complete guided onboarding', body: 'Tell us your business type, hours, services, prices, staff and communication preferences.' },
  { number: '03', title: 'Upload your business documents', body: 'Menus, price lists, policies and FAQs become your AI knowledge base.' },
  { number: '04', title: 'Run your business from the dashboard', body: 'Manage customers, bookings, sales, stock and marketing while the AI handles the repetitive work.' },
];

const INDUSTRIES = [
  { icon: Sparkles, name: 'Salons & spas', detail: 'Bookings, staff schedules, no-show reminders, service menus and rebooking offers.' },
  { icon: Store, name: 'Restaurants & bars', detail: 'Menus, reservations, table turnover insights, special offers and allergen FAQs.' },
  { icon: Truck, name: 'Retail & e-commerce', detail: 'Stock levels, low-stock alerts, best sellers, price lists and order history.' },
  { icon: ShieldCheck, name: 'Clinics', detail: 'Appointment slots, patient follow-ups, service pricing and privacy-first access control.' },
  { icon: CalendarCheck, name: 'Hotels & hospitality', detail: 'Guest requests, room services, local recommendations and fast guest replies.' },
  { icon: UserRound, name: 'Service businesses & freelancers', detail: 'Quotes, proposals, invoices, reminders and a pipeline for every opportunity.' },
];

const TESTIMONIALS = [
  {
    quote:
      'We stopped losing bookings the week we switched. The AI answers the same questions my staff answered a hundred times a day, and I finally see my numbers in one place.',
    name: 'Lerato M.',
    role: 'Owner, hair and beauty studio',
  },
  {
    quote:
      'Low-stock alerts alone paid for the subscription. We used to run out of our best seller every Friday. Now we reorder before it happens.',
    name: 'Daniel O.',
    role: 'Retail store manager',
  },
  {
    quote:
      'The follow-up assistant is the part I did not know I needed. It tells me who has gone quiet and gives me the message to send.',
    name: 'Fatima A.',
    role: 'Clinic operations lead',
  },
];

const FAQS = [
  {
    question: 'How is this different from a normal CRM?',
    answer:
      'A CRM stores contacts. Workspace Digital also runs the operations around them: bookings, stock, orders, tasks, documents and marketing — and it puts an AI assistant on top that answers from your own verified data. The AI is instructed never to invent prices, stock levels, policies or revenue figures.',
  },
  {
    question: 'Will the AI answer customers with made-up information?',
    answer:
      'No. Answers are retrieved from your knowledge base — the documents and FAQs you upload — and from your stored business data. When the AI is not confident it says a human is needed, collects the customer contact details, creates a support ticket and notifies your team instead of guessing.',
  },
  {
    question: 'Do I need technical skills to set this up?',
    answer:
      'No. Onboarding is a guided wizard: business details, hours, services, prices, staff and communication preferences. Uploading a price list or menu is a drag and drop away, and your dedicated manager can help you through it live.',
  },
  {
    question: 'Is my business data private?',
    answer:
      'Yes. Every business gets its own isolated workspace. Access is server-enforced per tenant, users only see businesses they belong to, roles control what each person can do, and administrator tooling shows aggregate statistics rather than other businesses’ private records.',
  },
  {
    question: 'Does anything get published automatically?',
    answer:
      'Never. Marketing content follows Generate → Edit → Approve → Publish. The platform will not post anything on your behalf without an explicit approval step from your team.',
  },
  {
    question: 'Can I start free and upgrade later?',
    answer:
      'Yes. The Free plan includes the dashboard, CRM, appointments, tasks, notifications and a monthly AI allowance. Upgrade to Starter, Professional or Business when you need more customers, users, AI messages, documents or storage.',
  },
  {
    question: 'Which industries do you support?',
    answer:
      'Salons, restaurants, bars, retail stores, e-commerce, clinics, hotels, service businesses, freelancers, agencies and small companies. The architecture is industry-aware, so industry-specific tools can be added without changing your data.',
  },
];

function HeroMock() {
  return (
    <div className="card overflow-hidden p-0 shadow-float" aria-hidden>
      <div className="flex items-center justify-between border-b bg-[rgb(var(--surface-muted))] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="muted ml-2 text-xs">Riverside Salon · dashboard</span>
        </div>
        <span className="muted hidden text-xs sm:block">AI assistant online</span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          <div className="rounded-xl border p-3">
            <p className="muted text-[11px] uppercase tracking-wide">Revenue · last 7 days</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-semibold">{formatMoney(482500)}</span>
              <span className="text-xs font-medium text-emerald-600">▲ 23%</span>
            </div>
            <svg viewBox="0 0 300 60" className="mt-3 h-14 w-full">
              <polyline
                points="0,48 40,40 80,44 120,30 160,34 200,22 240,26 300,12"
                fill="none"
                stroke="rgb(30 99 239)"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
              <polygon
                points="0,48 40,40 80,44 120,30 160,34 200,22 240,26 300,12 300,60 0,60"
                fill="rgb(30 99 239 / 0.12)"
              />
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Appointments', value: '38' },
              { label: 'New customers', value: '17' },
              { label: 'Low stock', value: '3' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border p-3">
                <p className="text-lg font-semibold">{stat.value}</p>
                <p className="muted text-[11px]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border p-3">
            <p className="muted text-[11px] uppercase tracking-wide">AI assistant</p>
            <p className="mt-2 text-xs">
              <span className="font-medium">You:</span> What should we promote this week?
            </p>
            <p className="mt-2 rounded-lg bg-[rgb(var(--surface-muted))] p-2 text-xs">
              <span className="font-medium">[Verified data]</span> Keratin treatment is your most booked service (24
              bookings). <span className="font-medium">[AI recommendation]</span> Bundle it with a blow-dry and promote
              to the 12 customers who have not booked in 30 days.
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="muted text-[11px] uppercase tracking-wide">Next appointments</p>
            <ul className="mt-2 space-y-2 text-xs">
              {[
                { time: '09:30', name: 'Naledi P.', service: 'Colour + cut' },
                { time: '11:00', name: 'Thabo M.', service: 'Beard trim' },
                { time: '14:15', name: 'Anika S.', service: 'Keratin' },
              ].map((appointment) => (
                <li key={appointment.time} className="flex items-center justify-between gap-2">
                  <span className="muted">{appointment.time}</span>
                  <span className="font-medium">{appointment.name}</span>
                  <span className="muted truncate">{appointment.service}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <p className="muted text-[11px] uppercase tracking-wide">Support</p>
              <StatusBadge status="OPEN" />
            </div>
            <p className="mt-2 text-xs">“Do you have parking?” — answered by AI from your FAQ.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav />
      <main id="main">
        {/* 1. Hero */}
        <section className="relative overflow-hidden border-b">
          <div className="hero-grid absolute inset-0 opacity-[0.35]" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <Badge tone="brand" className="mb-5">
                <Sparkles className="h-3 w-3" /> AI business operating system
              </Badge>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-[3.4rem]">
                Run Your Business Smarter With AI
              </h1>
              <p className="muted mt-5 max-w-xl text-lg">
                AI-powered tools that help businesses automate operations, serve customers, increase sales, and make
                better decisions from one platform.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup">
                  <Button size="lg">
                    <Rocket className="h-4 w-4" /> Start Free
                  </Button>
                </Link>
                <Link href="#contact">
                  <Button size="lg" variant="secondary">
                    <CalendarCheck className="h-4 w-4" /> Book a Demo
                  </Button>
                </Link>
              </div>
              <ul className="mt-8 grid gap-2 text-sm sm:grid-cols-2">
                {[
                  'Free plan, no card required',
                  'AI assistant on your own data',
                  'Isolated workspace per business',
                  'Set up in under 10 minutes',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="muted mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> WhatsApp {SUPPORT.whatsappDisplay}
                </span>
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> {SUPPORT_EMAIL}
                </span>
              </div>
            </div>
            <HeroMock />
          </div>
        </section>

        {/* 2. Problems */}
        <section id="problems" className="border-b bg-[rgb(var(--surface-muted))] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge tone="warning" className="mb-4">
                The everyday reality
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Growing a business should not mean drowning in admin
              </h2>
              <p className="muted mt-4">
                These are the problems we hear from salons, restaurants, clinics, stores and service businesses every
                week — and exactly what the platform is built to remove.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((problem) => {
                const Icon = problem.icon;
                return (
                  <div key={problem.title} className="card p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="text-sm font-semibold">{problem.title}</h3>
                    </div>
                    <p className="muted mt-3 text-sm">{problem.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. AI solutions */}
        <section id="solutions" className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge tone="brand" className="mb-4">
                <Bot className="h-3 w-3" /> AI built into the work, not bolted on
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">One AI layer across your whole operation</h2>
              <p className="muted mt-4">
                Every AI answer is labelled. You always know whether something is verified business data, taken from a
                document you uploaded, or an AI recommendation.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {SOLUTIONS.map((solution) => {
                const Icon = solution.icon;
                return (
                  <div key={solution.title} className="card p-5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold">{solution.title}</h3>
                    <p className="muted mt-2 text-sm">{solution.body}</p>
                    <Badge tone="brand" className="mt-4">
                      {solution.tag}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4. Platform features */}
        <section id="features" className="border-y bg-[rgb(var(--surface-muted))] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge tone="info" className="mb-4">
                Platform
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Everything operating a business needs</h2>
              <p className="muted mt-4">
                Real features backed by a real database — not a slideshow. Each module works on its own and shares one
                customer record.
              </p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="card flex gap-4 p-5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[rgb(var(--surface-muted))]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{feature.title}</h3>
                      <p className="muted mt-1 text-sm">{feature.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5. How it works */}
        <section id="how-it-works" className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <Badge tone="brand" className="mb-4">
                  <Workflow className="h-3 w-3" /> How it works
                </Badge>
                <h2 className="text-3xl font-semibold sm:text-4xl">From sign-up to running on autopilot</h2>
                <p className="muted mt-4">
                  You do not need an IT team. Onboarding is a guided wizard, your documents train the AI, and the
                  dashboard tells you what matters each morning.
                </p>
                <div className="card mt-8 p-5">
                  <p className="text-sm font-semibold">What the AI is told to do</p>
                  <p className="muted mt-2 text-sm italic">
                    “Use verified business data whenever available. Never invent prices, inventory levels, appointment
                    availability, policies, revenue figures, or customer information. If required information is
                    unavailable, clearly state that you do not have enough information and request human assistance.”
                  </p>
                </div>
              </div>
              <ol className="space-y-4">
                {STEPS.map((step) => (
                  <li key={step.number} className="card flex gap-5 p-5">
                    <span className="text-2xl font-semibold text-brand-600/70">{step.number}</span>
                    <div>
                      <h3 className="text-base font-semibold">{step.title}</h3>
                      <p className="muted mt-1 text-sm">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 6. Industries */}
        <section id="industries" className="border-y bg-[rgb(var(--surface-muted))] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge tone="success" className="mb-4">
                Industry solutions
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Built for the way your industry actually works</h2>
              <p className="muted mt-4">
                Start with the shared platform, then add the language, documents and workflows your industry uses —
                the data model already supports it.
              </p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry) => {
                const Icon = industry.icon;
                return (
                  <div key={industry.name} className="card p-5">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-brand-600" aria-hidden />
                      <h3 className="text-sm font-semibold">{industry.name}</h3>
                    </div>
                    <p className="muted mt-3 text-sm">{industry.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7. Pricing */}
        <section id="pricing" className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge tone="brand" className="mb-4">
                <Wallet className="h-3 w-3" /> Pricing
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Simple plans that grow with you</h2>
              <p className="muted mt-4">
                Start free. Upgrade when your customer list, team or AI usage grows. Every plan includes the full
                dashboard, CRM, appointments and notifications.
              </p>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-4">
              {PLAN_CATALOGUE.map((plan) => {
                const highlighted = plan.code === 'PROFESSIONAL';
                return (
                  <div
                    key={plan.code}
                    className={`card relative flex flex-col p-6 ${highlighted ? 'ring-2 ring-brand-600' : ''}`}
                  >
                    {highlighted ? (
                      <Badge tone="brand" className="absolute -top-3 left-6">
                        Most popular
                      </Badge>
                    ) : null}
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="muted mt-1 text-sm">{plan.tagline}</p>
                    <p className="mt-5 text-3xl font-semibold">
                      {plan.priceMonthCents === 0 ? 'Free' : formatMoney(plan.priceMonthCents, plan.currency)}
                      {plan.priceMonthCents > 0 ? (
                        <span className="muted text-sm font-normal"> / month</span>
                      ) : null}
                    </p>
                    <ul className="mt-5 space-y-2 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="muted mt-5 space-y-1 border-t pt-4 text-xs">
                      <p>{plan.limits.customers.toLocaleString()} customers · {plan.limits.users} users</p>
                      <p>{plan.limits.aiMessages.toLocaleString()} AI messages / month</p>
                      <p>{plan.limits.storageMb.toLocaleString()} MB document storage</p>
                    </div>
                    <div className="mt-6 flex-1" />
                    <Link href="/signup" className="block">
                      <Button variant={highlighted ? 'primary' : 'secondary'} className="w-full">
                        {plan.priceMonthCents === 0 ? 'Start Free' : `Choose ${plan.name}`}
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
            <p className="muted mt-6 text-sm">
              Prices in USD. Yearly billing available. Payment provider credentials are configured per deployment — we
              never hard-code payment keys in the application.
            </p>
          </div>
        </section>

        {/* 8. Testimonials */}
        <section className="border-y bg-[rgb(var(--surface-muted))] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <Badge tone="info" className="mb-4">
                What owners say
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Built with business owners, not for a demo</h2>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {TESTIMONIALS.map((testimonial) => (
                <figure key={testimonial.name} className="card flex h-full flex-col p-6">
                  <blockquote className="text-sm leading-relaxed">“{testimonial.quote}”</blockquote>
                  <figcaption className="muted mt-5 text-sm">
                    <span className="font-semibold text-[rgb(var(--text))]">{testimonial.name}</span> · {testimonial.role}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* 9. FAQ */}
        <section id="faq" className="py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <Badge tone="brand" className="mb-4">
                FAQ
              </Badge>
              <h2 className="text-3xl font-semibold sm:text-4xl">Questions we get every week</h2>
            </div>
            <div className="mt-10 space-y-3">
              {FAQS.map((faq) => (
                <details key={faq.question} className="card group p-5">
                  <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {faq.question}
                      <span className="text-brand-600 transition group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="muted mt-3 text-sm">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 10. CTA + manager */}
        <section id="contact" className="border-t bg-[rgb(var(--surface-muted))] py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
              <div>
                <Badge tone="brand" className="mb-4">
                  <Rocket className="h-3 w-3" /> Get started
                </Badge>
                <h2 className="text-3xl font-semibold sm:text-4xl">
                  Start free today, or talk to a real person first
                </h2>
                <p className="muted mt-4">
                  Create your workspace and start with the free plan, or request a guided demo. You will speak directly
                  with our platform manager — the same person who helps configure your AI assistant.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/signup">
                    <Button size="lg">
                      <Rocket className="h-4 w-4" /> Start Free
                    </Button>
                  </Link>
                  <a
                    href={whatsappHref(WHATSAPP_DEFAULT_MESSAGE)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button size="lg" variant="secondary">
                      <MessageSquare className="h-4 w-4" /> WhatsApp {SUPPORT.whatsappDisplay}
                    </Button>
                  </a>
                </div>
                <div className="muted mt-6 space-y-1 text-sm">
                  <p>Phone: {SUPPORT_PHONE}</p>
                  <p>Email: {SUPPORT_EMAIL}</p>
                  <p>Support hours: Monday to Saturday, 08:00–18:00</p>
                </div>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {[
                    { icon: Lock, title: 'Secure by design', body: 'Hashed passwords, server-side sessions and role-based access.' },
                    { icon: Database, title: 'Your data, isolated', body: 'Every business has its own workspace and records.' },
                    { icon: Activity, title: 'Audit trail', body: 'Important changes are logged for owners and admins.' },
                    { icon: XCircle, title: 'No auto-publishing', body: 'Marketing content always waits for your approval.' },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="flex gap-3">
                        <Icon className="mt-0.5 h-4 w-4 text-brand-600" aria-hidden />
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="muted text-xs">{item.body}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-6">
                <DemoForm />
                <div id="manager">
                  <ManagerCard />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 11. Footer */}
      <MarketingFooter />
    </div>
  );
}
