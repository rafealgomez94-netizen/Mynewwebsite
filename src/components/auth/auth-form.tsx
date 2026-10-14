'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Checkbox, Field, Input, apiRequest, useToast } from '@/components/ui';
import { passwordIssues } from '@/lib/validation';

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify' | 'invite';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();
  const token = params.get('token') ?? '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    acceptTerms: false,
    marketingOptIn: true,
  });

  // Verification links are consumed as soon as the page loads.
  useEffect(() => {
    if (mode !== 'verify' || !token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await apiRequest<{ verified: boolean }>('/api/auth/verify-email', { body: { token } });
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setInfo('Your email address is verified. You can continue to your workspace.');
      } else {
        setError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setDevLink(null);

    if (mode === 'signup') {
      const issues = passwordIssues(form.password);
      if (issues.length) {
        setError(issues.join('. '));
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await apiRequest<{ next: string }>('/api/auth/login', {
          body: { email: form.email, password: form.password },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        push('Welcome back!', 'success');
        router.push(result.data.next ?? '/dashboard');
        router.refresh();
        return;
      }

      if (mode === 'signup') {
        const result = await apiRequest<{ verification?: { devUrl?: string; emailSent?: boolean } }>(
          '/api/auth/signup',
          {
            body: {
              name: form.name,
              email: form.email,
              password: form.password,
              phone: form.phone,
              acceptTerms: form.acceptTerms,
              marketingOptIn: form.marketingOptIn,
            },
          },
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        push('Account created — let’s set up your business.', 'success');
        if (result.data.verification?.devUrl) sessionStorage.setItem('wd-dev-verify-url', result.data.verification.devUrl);
        router.push('/onboarding');
        router.refresh();
        return;
      }

      if (mode === 'forgot') {
        const result = await apiRequest<{ devUrl?: string }>('/api/auth/forgot-password', {
          body: { email: form.email },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setInfo('If an account exists for that email, a reset link is on its way. The link expires in 60 minutes.');
        if (result.data.devUrl) setDevLink(result.data.devUrl);
        return;
      }

      if (mode === 'reset') {
        const issues = passwordIssues(form.password);
        if (issues.length) {
          setError(issues.join('. '));
          return;
        }
        const result = await apiRequest('/api/auth/reset-password', {
          body: { token, password: form.password },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setInfo('Your password has been updated. You can sign in with the new password.');
        setTimeout(() => router.push('/login'), 1200);
        return;
      }

      if (mode === 'invite') {
        if (!token) {
          setError('This invitation link is incomplete. Ask your team owner to resend it.');
          return;
        }
        const result = await apiRequest('/api/auth/reset-password', {
          body: { token, password: form.password },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setInfo('Your password is set. Sign in to open the shared workspace.');
        setTimeout(() => router.push('/login'), 1200);
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    setLoading(true);
    const result = await apiRequest<{ devUrl?: string }>('/api/auth/verify-email', { method: 'PUT' });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo('Verification email sent.');
    if (result.data.devUrl) setDevLink(result.data.devUrl);
  };

  const titles: Record<Mode, { heading: string; sub: string; cta: string }> = {
    login: { heading: 'Welcome back', sub: 'Sign in to your business workspace.', cta: 'Sign in' },
    signup: { heading: 'Create your workspace', sub: 'Start free — no card required.', cta: 'Create account' },
    forgot: { heading: 'Reset your password', sub: 'We will email you a secure reset link.', cta: 'Send reset link' },
    reset: { heading: 'Choose a new password', sub: 'Use at least 8 characters with a letter and a number.', cta: 'Update password' },
    verify: { heading: 'Verify your email', sub: 'Confirming the address on your account.', cta: 'Continue' },
    invite: { heading: 'Join your team workspace', sub: 'Set a password to accept the invitation.', cta: 'Accept invitation' },
  };
  const copy = titles[mode];

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-semibold">{copy.heading}</h1>
      <p className="muted mt-1 text-sm">{copy.sub}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {error ? (
          <Alert tone="danger">
            {error}
            {mode === 'verify' ? (
              <button type="button" onClick={resendVerification} className="mt-2 block text-xs font-semibold underline">
                Resend verification email
              </button>
            ) : null}
          </Alert>
        ) : null}
        {info ? <Alert tone="success">{info}</Alert> : null}
        {devLink ? (
          <Alert tone="info" title="Development mode">
            No SMTP provider configured, so here is the link:{' '}
            <a className="font-semibold underline" href={devLink}>
              open link
            </a>
          </Alert>
        ) : null}

        {mode === 'signup' ? (
          <Field label="Your name" required>
            <Input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Rafeal Gomez"
              autoComplete="name"
            />
          </Field>
        ) : null}

        {mode !== 'reset' && mode !== 'invite' && mode !== 'verify' ? (
          <Field label="Email address" required>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="you@business.com"
              autoComplete="email"
            />
          </Field>
        ) : null}

        {mode === 'signup' ? (
          <Field label="Phone / WhatsApp" hint="Used for appointment reminders and customer support handoff.">
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="0774075285"
              autoComplete="tel"
            />
          </Field>
        ) : null}

        {['login', 'signup', 'reset', 'invite'].includes(mode) ? (
          <Field
            label={mode === 'reset' || mode === 'invite' ? 'New password' : 'Password'}
            required
            hint={mode === 'signup' || mode === 'reset' || mode === 'invite' ? 'Minimum 8 characters, with a letter and a number.' : undefined}
          >
            <Input
              required
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="••••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>
        ) : null}

        {mode === 'signup' ? (
          <div className="space-y-2">
            <Checkbox
              checked={form.acceptTerms}
              onChange={(event) => setForm({ ...form, acceptTerms: event.target.checked })}
              label={
                <>
                  I agree to the{' '}
                  <Link href="/terms" className="text-brand-600 hover:underline">
                    terms of service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-brand-600 hover:underline">
                    privacy policy
                  </Link>
                  .
                </>
              }
              required
            />
            <Checkbox
              checked={form.marketingOptIn}
              onChange={(event) => setForm({ ...form, marketingOptIn: event.target.checked })}
              label="Send me product updates and business growth tips."
            />
          </div>
        ) : null}

        {mode === 'verify' ? (
          <Button type="button" onClick={() => router.push('/dashboard')} variant="secondary" className="w-full">
            Continue to dashboard
          </Button>
        ) : (
          <Button type="submit" loading={loading} className="w-full">
            {copy.cta}
          </Button>
        )}
      </form>

      <div className="muted mt-6 space-y-2 text-sm">
        {mode === 'login' ? (
          <>
            <p>
              New to Workspace Digital?{' '}
              <Link href="/signup" className="font-semibold text-brand-600 hover:underline">
                Create an account
              </Link>
            </p>
            <p>
              <Link href="/forgot-password" className="hover:underline">
                Forgot your password?
              </Link>
            </p>
          </>
        ) : null}
        {mode === 'signup' ? (
          <p>
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        ) : null}
        {mode === 'forgot' || mode === 'reset' || mode === 'invite' ? (
          <p>
            <Link href="/login" className="font-semibold text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        ) : null}
        {mode === 'verify' ? (
          <p>
            Wrong account?{' '}
            <Link href="/logout" className="hover:underline">
              Sign out
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
