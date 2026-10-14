import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = { title: 'signup' };

export default function Page() {
  return (
    <Suspense fallback={<div className="muted text-sm">Loading…</div>}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
