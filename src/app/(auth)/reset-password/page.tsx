import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';

export const metadata: Metadata = { title: 'reset-password' };

export default function Page() {
  return (
    <Suspense fallback={<div className="muted text-sm">Loading…</div>}>
      <AuthForm mode="reset" />
    </Suspense>
  );
}
